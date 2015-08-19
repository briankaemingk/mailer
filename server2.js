/**
 * Created by kaemibr on 8/14/2015.
 */
var nodemailer = require('nodemailer');
var xoauth2gen = require('xoauth2');
var Imap = require('imap');
var inspect = require('util').inspect;
var imap;

xoauth2gen = xoauth2gen.createXOAuth2Generator({
    user: process.env.USER,
    clientId: process.env.CLIENTID,
    clientSecret: process.env.CLIENTSECRET,
    refreshToken: process.env.REFRESHTOKEN
});


//Get login token
xoauth2gen.getToken(function (err, token) {
    if (err) {
        return console.log(err);
    }
    accessImap(token);
});

var transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        xoauth2: xoauth2gen
    },
    debug: true
});

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
        console.log('Message sent: ' + info.response);

        //info.once("sent", function(data){
        //    console.log("Message was accepted by %s", data.domain);
        //});
    });
}

function accessImap(token) {
    imap = new Imap({
        xoauth2: token,
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        keepalive: false
    });

    function openInbox(cb) {
        imap.openBox('INBOX', true, cb);
    }

    imap.once('ready', function () {
        openInbox(function (err, box) {
                if (err) throw err;
                //console.log('Inbox has ' + box.messages.total + ' messages');

                //If the inbox has more than one message in it
                if (box.messages.total === 0) {
                    console.log('Inbox has 0 messages');
                    imap.close();
                }
                else {
                    var messages = [];
                    var send_messages = [];

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
                        //msg.once('attributes', function (attrs) {
                        //    console.log('Attributes: %s', inspect(attrs, false, 8));
                        //});
                        //msg.once('end', function () {
                        //    console.log('Finished');
                        //});
                    });
                    f.once('error', function (err) {
                        console.log('Fetch error: ' + err);
                    });
                    f.once('end', function () {
                        //Matches anything that starts with "Notification - Your " and ends with " bill has arrived"
                        var from1_patt_sub = /^Notification - Your (.*)(?= bill has arrived)/;


                        messages.forEach(function (message) {

                            //if the message is from:FROM1 and the subject matches a string that starts with:
                            //"Notification - Your " and ends with " bill has arrived"
                            if (process.env.FROM1 === message.header.from.toString() && from1_patt_sub.test(message.header.subject.toString())) {
                                console.log(message.header.subject.toString() + ' MATCHES');

                                //Get bank
                                var bank = message.header.subject.toString().match(from1_patt_sub)[1];

                                //Finds the dollar amount and the due date of the payment
                                var from1_patt_body = /Your payment for (\$[0-9,.]+) from CHECKING is scheduled for ([0-9\/]+)/;
                                var bill_amount = message.body.match(from1_patt_body)[1];
                                var payment_date = message.body.match(from1_patt_body)[2];
                                //console.log('bill amt '+ bill_amount + ' payment date ' + payment_date);
                                var subject = payment_date + ' - ' + bill_amount + ' ' + bank + ' bill <pgen>';
                                console.log(subject);
                                send_messages.push({subject: subject, body: message.body});
                            }

                        });

                        if (send_messages.length !== 0) {
                            send_messages.forEach(function (message) {
                                sendMail(message);
                            });
                        }

                        imap.end();
                    });
                }
            }
        )
        ;
    });

    imap.once('error', function (err) {
        console.log(err);
    });

    imap.once('end', function () {
        console.log('Connection ended');
    });
    imap.connect();
}