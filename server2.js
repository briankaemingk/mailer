/**
 * Created by kaemibr on 8/14/2015.
 */
var nodemailer = require('nodemailer');
var xoauth2gen = require('xoauth2');
var Imap = require('imap');
var inspect = require('util').inspect;
var imap;
var transporter;

//Initialize xoauth2 generator
xoauth2gen = xoauth2gen.createXOAuth2Generator({
    user: process.env.USER,
    clientId: process.env.CLIENTID,
    clientSecret: process.env.CLIENTSECRET,
    refreshToken: process.env.REFRESHTOKEN
});

//Initialize transporter to send mail
transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        xoauth2: xoauth2gen
    }
});

//Get login token
xoauth2gen.getToken(initializeImap);

//Initialize imap object
function initializeImap(err, token){
    if (err) {
        return console.log(err);
    }
    imap = new Imap({
        xoauth2: token,
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        keepalive: true
    });

    imap.connect();
    imap.once('ready', runOnceConnected);

    imap.once('error', function (err) {
        console.log(err);
    });

    imap.once('end', function () {
        console.log('Connection ended');
    });
}

function runOnceConnected(){
    scanInboxforFROM1NewBill();
    scanWFforPaymentsMade();
}

//Checks if inbox has any messages in it.
//If it does -> go through every message and looks for a FROM1 newly arrived bill
//If it doesn't -> wait for new messages and go through those if they exist
function scanInboxforFROM1NewBill() {

    imap.openBox('INBOX', false, function (err, box) {
        if (err) throw err;
        //console.log('Inbox has ' + box.messages.total + ' messages');

        //If the inbox has more than one message in it
        if (box.messages.total === 0) {
            //console.log('Inbox has 0 messages');

            imap.once('mail', function (num) {
                console.log(num + ' new message');
                filterFROM1();
            });
        }
        else {

            var messages = [];

            //For every message in the inbox
            var f = imap.seq.fetch('1:' + box.messages.total, {
                    bodies: ['HEADER.FIELDS (TO FROM SUBJECT)', 'TEXT']
                })
                ;

            f.on('message', function (msg, seqno) {
                //console.log('Message #%d', seqno);
                //var prefix = '(#' + seqno + ') ';
                var message = {};
                messages[seqno] = message;

                msg.on('body', function (stream, info) {
                    var buffer = '', count = 0;
                    var header;
                    stream.on('data', function (chunk) {
                        count += chunk.length;
                        buffer += chunk.toString('utf8');
                        //    if (info.which === 'TEXT')
                        //        console.log(prefix + 'Body [%s] (%d/%d)', inspect(info.which), count, info.size);
                    });
                    stream.once('end', function () {
                            if (info.which !== 'TEXT') {
                                header = Imap.parseHeader(buffer);
                                messages[seqno].header = header;
                            }
                            else {
                                messages[seqno].body = buffer;
                                //console.log(buffer);
                            }
                        }
                    )
                    ;
                });
                msg.once('attributes', function (attrs) {
                    //console.log('Attributes: %s', inspect(attrs));
                    messages[seqno].attributes = attrs;
                });
                //msg.once('end', function () {
                //    console.log('Finished');
                //});
            });
            f.once('error', function (err) {
                console.log('Fetch error: ' + err);
            });

            f.once('end', function () {
                //Matches anything that starts with "Notification - Your " and ends with " bill has arrived"
                var from1_patt_sub_bill_arrived = /^Notification - Your (.*)(?= bill has arrived)/;
                //Finds the dollar amount and the due date of the payment
                var from1_patt_body = /Your payment for (\$[0-9,.]+) from CHECKING is scheduled for ([0-9\/]+)/;

                //Go through all messages in the inbox
                messages.forEach(function (message) {

                        //if the message is from:FROM1
                        // AND the subject matches a string that starts with: "Notification - Your " and ends with " bill has arrived"
                        // AND the body has a scheduled payment amount
                        if (process.env.FROM1 === message.header.from.toString()
                            && from1_patt_sub_bill_arrived.test(message.header.subject.toString())
                            && from1_patt_body.test(message.body)
                        ) {
                            console.log('Email with subject: <' + message.header.subject.toString() + '> recognized as a newly arrived bill');

                            imap.setFlags(message.attributes.uid, '\Deleted', function (err) {
                                if (err)
                                    console.log(err);
                            });


                            //Get bank
                            var bank = message.header.subject.toString().match(from1_patt_sub_bill_arrived)[1];
                            var bill_amount = message.body.match(from1_patt_body)[1];
                            var payment_date = message.body.match(from1_patt_body)[2];
                            //console.log('bill amt '+ bill_amount + ' payment date ' + payment_date);
                            var subject = payment_date + ' - ' + bill_amount + ' ' + bank + ' bill <pgen>';
                            sendMail({subject: subject, body: message.body});
                        }


                    }
                );

                //imap.end();

                imap.once('mail', function (num) {
                    console.log(num + ' new message');
                    scanInboxforFROM1NewBill();
                });

                //imap.end();
            });
        }
    });
};

//Go through every message in the @WaitingFor mailbox.
//Deleting the @WaitingFor label for when the payment will be posted/withdrawn
function scanWFforPaymentsMade(){

};

//Takes a message object with a subject:"" and body:"" and sends the messsage from and to USER
function sendMail(message) {
    // setup e-mail data
    var mail_opts = {
        from: process.env.USER, // sender address
        to: process.env.USER, // list of receivers
        subject: message.subject.toString(), // Subject line
        text: message.body // plaintext body
    };

    transporter.sendMail(mail_opts, function (error, info) {
        if (error) {
            return console.log(error);
        }
        console.log('Message sent: <' + mail_opts.subject + '>');
    });
}
