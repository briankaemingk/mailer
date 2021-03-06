/**
 * Created by kaemibr on 9/2/2015.
 */
require('dotenv').load();
var xoauth2gen = require('xoauth2');
var Imap = require('imap');
var nodemailer = require('nodemailer');
var inboxImap;
var bdn30Imap;
var corpcardchargeImap;
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

sendNextMonthsBills();

//Get login token
xoauth2gen.getToken(initializeImap);

//Initialize imap object
function initializeImap(err, token) {
    if (err) throw err;
    inboxImap = new Imap({
        xoauth2: token,
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        keepalive: false
    });

    bdn30Imap = new Imap({
        xoauth2: token,
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        keepalive: false
    });

    corpcardchargeImap = new Imap({
        xoauth2: token,
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        keepalive: false
    });


    //Set up initial inbox listeners
    inboxImap.connect();
    inboxImap.once('ready', scanInboxforFROM1NewBill);
    inboxImap.once('error', function (err) {
        console.log(err);
    });

    inboxImap.once('end', function () {
        console.log('Connection ended');
    });

    //Set up initial bdn30 listeners
    bdn30Imap.connect();
    bdn30Imap.once('ready', scanbdn30forPaymentsMade);
    bdn30Imap.once('error', function (err) {
        console.log(err);
    });
    bdn30Imap.once('end', function () {
        console.log('Connection ended');
    });

    //Set up initial corpcardcharge listeners
    corpcardchargeImap.connect();
    corpcardchargeImap.once('ready', scanCorpCardChargeExpenseinGTE);
    corpcardchargeImap.once('error', function (err) {
        console.log(err);
    });
    corpcardchargeImap.once('end', function () {
        console.log('Connection ended');
    });

}

//Send new bills if it's the right day of the month
function sendNextMonthsBills() {
    var d = new Date();
    var today = addLeadingZero(new String(d.getDate())).toString();
    //console.log('today: ' + today + typeof today );
    //console.log('CP1date: ' + process.env.CP1DATE + typeof process.env.CP1DATE);
    //console.log(getDateToday());

    if (today === process.env.CP1DATE) {
        console.log("today===CP1Date");
        var subject = 'Notification: ' + getDateNextMonth() + ' - ' + '$' + process.env.CP1AMT + ' ' + process.env.CP1NAME + ' bill <bdn30>';
        sendMail({subject: subject, body: ''});
    }

    if (today === process.env.CP2DATE) {
        var subject = 'Notification: ' + getDateNextMonth() + ' - ' + '$' + process.env.CP2AMT + ' ' + process.env.CP2NAME + ' bill <bdn30>';
        sendMail({subject: subject, body: ''});
    }
}

//Checks if inbox has any messages in it.
//If it does -> go through every message and looks for a FROM1 newly arrived bill
//If it doesn't -> wait for new messages and go through those if they exist
function scanInboxforFROM1NewBill() {
    inboxImap.openBox('INBOX', false, function (err, box) {
        if (err) throw err;

        //If the box is empty
        if (box.messages.total === 0) {

            //LOGGED
            console.log(getDateAndTime() + '~ ' + box.messages.total + ' message in inbox on startup');
            inboxImap.end();
        }

        //If the box has messages in it
        else {

            //DEBUG
            //console.log(getDateAndTime() + '~ ' + box.messages.total + ' messages in inbox');

            //For every message in the inbox
            var f = inboxImap.seq.fetch('1:' + box.messages.total, {
                bodies: ['HEADER.FIELDS (TO FROM SUBJECT)', 'TEXT']
            });

            f.on('message', function (msg, seqno) {
                //console.log('Message #%d', seqno);
                //var prefix = '(#' + seqno + ') ';
                var message = {};

                msg.on('body', function (stream, info) {
                    var buffer = '', count = 0, header;
                    stream.on('data', function (chunk) {
                        count += chunk.length;
                        buffer += chunk.toString('utf8');
                        //    if (info.which === 'TEXT')
                        //        console.log(prefix + 'Body [%s] (%d/%d)', inspect(info.which), count, info.size);
                    });
                    stream.once('end', function () {
                            if (info.which !== 'TEXT') {
                                header = Imap.parseHeader(buffer);
                                message.header = header;
                            }
                            else {
                                message.body = buffer;
                            }
                        }
                    )
                    ;
                });
                msg.once('attributes', function (attrs) {
                    //console.log('Attributes: %s', inspect(attrs));
                    message.attributes = attrs;
                });
                msg.once('end', function () {
                    //console.log('Finished message');

                    //Matches anything that starts with "Notification - Your " and ends with " bill has arrived"
                    var from1_patt_sub_bill_arrived = /^Notification - Your (.*)(?= bill has arrived)/;
                    //Finds the dollar amount and the due date of the payment
                    var from1_patt_body = /Your payment for (\$[0-9,.]+) from CHECKING is scheduled for ([0-9\/]+)/;

                    //if the message is from:FROM1
                    // AND the subject matches a string that starts with: "Notification - Your " and ends with " bill has arrived"
                    // AND the body has a scheduled payment amount
                    if (process.env.FROM1 === message.header.from.toString()
                        && from1_patt_sub_bill_arrived.test(message.header.subject.toString())
                        && from1_patt_body.test(message.body)
                    ) {
                        console.log('Email with subject: <' + message.header.subject.toString() + '> recognized as a newly arrived bill');

                        inboxImap.setFlags(message.attributes.uid, '\Deleted', function (err) {
                            if (err)
                                console.log(err);
                        });

                        //Get bank
                        var bank = message.header.subject.toString().match(from1_patt_sub_bill_arrived)[1];
                        var bill_amount = message.body.match(from1_patt_body)[1];
                        var payment_date = message.body.match(from1_patt_body)[2];

                        //Find the bill due date
                        var from1_patt_body_2 = /Bill due by:\s+([0-9\/]+)/;

                        var bill_due_date = message.body.match(from1_patt_body_2)[1];
                        //console.log('bill due: ' + bill_due_date);

                        //console.log('bill amt '+ bill_amount + ' payment date ' + payment_date);
                        var subject = 'Notification: ' + bill_due_date + ' - ' + bill_amount + ' ' + bank + ' bill <bdn30>';
                        sendMail({subject: subject, body: message.body});
                    }
                });

            });
            f.once('error', function (err) {
                console.log('Fetch error: ' + err);
            });
            inboxImap.end();
        }
    });

}

function scanCorpCardChargeExpenseinGTE() {
    corpcardchargeImap.openBox('corpcardcharge', false, function (err, box) {
        if (err) throw err;

        //If the box is empty
        if (box.messages.total === 0)
            corpcardchargeImap.end();

        //If the box has messages in it
        else {

            var messages = [];

            //For every message in the inbox
            var f = corpcardchargeImap.seq.fetch('1:' + box.messages.total, {
                    bodies: ['HEADER.FIELDS (TO FROM SUBJECT)']
                })
                ;

            f.on('message', function (msg, seqno) {
                //console.log('Message #%d', seqno);
                //var prefix = '(#' + seqno + ') ';
                var message = {};

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
                                message.header = header;
                            }
                            else {
                                message.body = buffer;
                                //console.log(buffer);
                            }
                        }
                    )
                    ;
                });
                msg.once('attributes', function (attrs) {
                    //console.log('Attributes: %s', inspect(attrs));
                    message.attributes = attrs;
                });
                msg.once('end', function () {
                    //console.log('Finished');

                    //Matches a date sent pattern
                    var corpcharge_patt_date_sent = /^[a-z]+ [a-z]+ [0-9]+ [0-9]+/i;
                    var subject = message.header.subject.toString();
                    var date_sent = message.attributes.date.toString();
                    var date_sent_formatted = date_sent.match(corpcharge_patt_date_sent)[0];
                    //console.log(date_sent_formatted);

                    var five_days_ago = new Date();
                    five_days_ago.setDate(five_days_ago.getDate() - 5);
                    five_days_ago = five_days_ago.toString();
                    //console.log('five days ago: ' + five_days_ago);
                    var five_days_ago_formatted = five_days_ago.match(corpcharge_patt_date_sent)[0];
                    //console.log(five_days_ago_formatted);

                    //If the alert was sent five days ago, then put it back in the inbox and mark it as unread
                    if (five_days_ago_formatted === date_sent_formatted) {
                        console.log('New corp charge in GT&E: <' + subject + '>');
                        corpcardchargeImap.delFlags(message.attributes.uid, '\Seen', function (err) {
                            if (err)
                                console.log(err);
                        });
                        //Move to the inbox
                        corpcardchargeImap.move(message.attributes.uid, 'INBOX', function (err) {
                            if (err)
                                console.log(err);
                        });
                    }
                    ////moves all other corpchargecard messages to the inbox
                    //else {
                    //    corpcardchargeImap.copy(message.attributes.uid, 'INBOX', function (err) {
                    //        if (err)
                    //            console.log(err);
                    //    });
                    //}

                });
            });

            f.once('error', function (err) {
                console.log('Fetch error: ' + err);
            });
            corpcardchargeImap.end();
        }
    });
}

//Sweeps through the bdn30 mailbox, deleting the bdn30 label when the payment posted date is today
function scanbdn30forPaymentsMade() {
    bdn30Imap.openBox('bills due (30 days)', false, function (err, box) {
        if (err) throw err;

        //Matches a date sent pattern
        var bdn30_patt_date_sent = /^[a-z]+ ([a-z]+)/i;

        //Matches first part of date
        var patt_date = /^[a-z]+ ([a-z]+ [0-9]+ [0-9]+)/i;

        var d = new Date();
        var today = addLeadingZero(new String(d.getDate()));
        //console.log('today: ' + today);

        //If the box is empty
        if (box.messages.total === 0)
            bdn30Imap.end();

        //If the box has messages in it
        else {
            //Matches the payment date and the dollar amount of the subject
            var bdn30_patt_sub = /^Notification: ([0-9\/]+) - (\$[0-9,.]+).*/;

            //Matches a 00/xx/0000 pattern
            var bdn30_patt_generic_date = /00\/([0-9][0-9])\/0000/;


            //For every message in the inbox
            var f = bdn30Imap.seq.fetch('1:' + box.messages.total, {
                    bodies: ['HEADER.FIELDS (TO FROM SUBJECT)']
                })
                ;

            f.on('message', function (msg, seqno) {
                //console.log('Message #%d', seqno);
                //var prefix = '(#' + seqno + ') ';
                var message = {};

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
                                message.header = header;
                            }
                            else {
                                message.body = buffer;
                                //console.log(buffer);
                            }
                        }
                    )
                    ;
                });
                msg.once('attributes', function (attrs) {
                    //console.log('Attributes: %s', inspect(attrs));
                    message.attributes = attrs;
                });
                msg.once('end', function () {
                    //console.log('Finished');

                    var subject = message.header.subject.toString();
                    var date_sent = message.attributes.date.toString();
                    //console.log('date sent: ' + date_sent);
                    var month_sent_name = date_sent.match(bdn30_patt_date_sent)[1];
                    var month_sent_num = addLeadingZero(convertMonthNameToNumber(month_sent_name).toString());
                    //console.log('month sent num: ' + month_sent_num);


                    var last_month = addLeadingZero(new String(d.getMonth()));
                    //console.log('last month: ' + last_month);

                    //if the message is in the generated format (not a check manually added, for example)
                    if (bdn30_patt_sub.test(subject)) {
                        var payment_date = subject.match(bdn30_patt_sub)[1];
                        var bill_amount = subject.match(bdn30_patt_sub)[2];

                        //console.log('bill amt ' + bill_amount + ' payment date ' + payment_date);

                        //If the payment was processed today, archive the message
                        if (payment_date === getDateToday()) {
                            bdn30Imap.setFlags(message.attributes.uid, '\Deleted', function (err) {
                                if (err)
                                    console.log(err);
                                console.log('Payment made: <' + subject + '>');
                            });
                        }



                        //If the date is in a generic payment days in the format 00/xx/0000
                        else if (bdn30_patt_generic_date.test(payment_date)) {
                            var generic_payment_day = payment_date.match(bdn30_patt_generic_date)[1];
                            //console.log('generic payment day: ' + generic_payment_day);

                            //If payment date is today and the month the email was sent was last month, archive the message
                            if (generic_payment_day === today && month_sent_num === last_month) {
                                bdn30Imap.setFlags(message.attributes.uid, '\Deleted', function (err) {
                                    if (err)
                                        console.log(err);
                                    console.log('Payment made: <' + subject + '>');
                                });
                            }
                        }
                    }

                });
            });

            f.once('error', function (err) {
                console.log('Fetch error: ' + err);
            });
            bdn30Imap.end();
        }
    });
}


function addLeadingZero(string) {
    if (string.length === 1)
        string = "0" + string;
    return string;
}

function getDateAndTime() {
    var d = (new Date()).toString();
    var date_time_patt = /.+ .+ .+ .+ [0-9]{2}:[0-9]{2}/;
    d = d.match(date_time_patt)[0];
    return d;
}


function getDateToday() {
//new Date(year, month[, day[, hour[, minutes[, sec onds[, milliseconds]]]]]);
    var d = new Date();
    //console.log(d.getMonth());
    var month = addLeadingZero(new String(d.getMonth() + 1));
    var day = addLeadingZero(new String(d.getDate()));

    var date_string = month + '/' + day + '/' + d.getFullYear();
    return date_string;
}

function getDateNextMonth() {

    var now = new Date();
    if (now.getMonth() == 11) {
        var nextMonth = new Date(now.getFullYear() + 1, 0, now.getDate());
    } else {
        var nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
    }

    var month = addLeadingZero(new String(nextMonth.getMonth()+1));
    var day = addLeadingZero(new String(nextMonth.getDate()));

    var date_string = month + '/' + day + '/' + nextMonth.getFullYear();
    return date_string;
}

function convertMonthNameToNumber(monthName) {
    var myDate = new Date(monthName + " 1, 2000");
    var monthDigit = myDate.getMonth();
    return isNaN(monthDigit) ? 0 : (monthDigit + 1);
}

//Takes a message object with a subject:"" and body:"" and sends the messsage from and to USER
function sendMail(message) {
    //Setup e-mail data
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
