/**
 * Created by kaemibr on 8/14/2015.
 */
var nodemailer = require('nodemailer');
var xoauth2gen = require('xoauth2');
var Imap = require('imap');
var inspect = require('util').inspect;

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

function sendMail() {
    var transporter = nodemailer.createTransport(({
        service: 'gmail',
        auth: {
            xoauth2: xoauth2gen
        }
    }));

    // setup e-mail data
    var mail_opts = {
        from: process.env.USER, // sender address
        to: process.env.USER, // list of receivers
        subject: 'Hello ?', // Subject line
        text: 'Hello world ?', // plaintext body
        html: '<b>Hello world ?</b>' // html body
    };

    transporter.sendMail(mail_opts, function (error, info) {
        if (error) {
            return console.log(error);
        }
        console.log('Message sent: ' + info.response);
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
                //var prefix = '(#' + seqno + ') ';
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
                imap.close();
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