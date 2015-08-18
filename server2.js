/**
 * Created by kaemibr on 8/14/2015.
 */
var nodemailer = require('nodemailer');
var xoauth2 = require('xoauth2');
var Imap = require('imap');
var inspect = require('util').inspect;
var xoauth2gen;

//Use secret stuff here
//commenting this well
xoauth2gen = require('xoauth2').createXOAuth2Generator({
    user: process.env.USER,
    clientId: process.env.CLIENTID,
    clientSecret: process.env.CLIENTSECRET,
    refreshToken: process.env.REFRESHTOKEN
});


// SMTP/IMAP
var myToken = xoauth2gen.getToken(function (err, token) {
    if (err) {
        return console.log(err);
    }
    accessImap(token);
});


// login
var transporter = nodemailer.createTransport(({
    service: 'gmail',
    auth: {
        xoauth2: xoauth2gen
    }
}));

function sendMail() {
// send mail
    transporter.sendMail({
        from: process.env.USER,
        to: process.env.USER,
        subject: 'hello world!',
        text: 'Authenticated with OAuth2'
    });
}


function accessImap(token) {
    var imap = new Imap({
        xoauth2: token,
        host: 'imap.gmail.com',
        port: 993,
        tls: true
    });

    function openInbox(cb) {
        imap.openBox('INBOX', true, cb);
    }

    imap.once('ready', function () {
        openInbox(function (err, box) {
            if (err) throw err;
            //console.log('Inbox has ' + box.messages.total + ' messages');

            //For every message in the inbox
            var f = imap.seq.fetch('1:' + box.messages.total, {
                    bodies: ['HEADER.FIELDS (TO FROM SUBJECT)', 'TEXT']
                })
                ;

            f.on('message', function (msg, seqno) {
                //console.log('Message #%d', seqno);
                var prefix = '(#' + seqno + ') ';
                msg.on('body', function (stream, info) {
                    //if (info.which === 'TEXT')
                    //    console.log(prefix + 'Body [%s] found, %d total bytes', inspect(info.which), info.size);
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
                            console.log(header.subject.toString());
                        }
                        else
                            var body = inspect(info.which);
                    });
                });
                //msg.once('attributes', function (attrs) {
                //    console.log(prefix + 'Attributes: %s', inspect(attrs, false, 8));
                //});
                //msg.once('end', function () {
                //    console.log(prefix + 'Finished');
                //});
            });
            f.once('error', function (err) {
                console.log('Fetch error: ' + err);
            });
            f.once('end', function () {
                console.log('Done fetching all messages!');
                imap.end();
            });
        });
    });

    imap.once('error', function (err) {
        console.log(err);
    });

    imap.once('end', function () {
        console.log('Connection ended');
    });

    imap.connect();
}