/**
 * Created by kaemibr on 8/24/2015.
 */
require('dotenv').load();
var Heroku = require('heroku-client'),
    heroku = new Heroku({token: process.env.HEROKU_API_TOKEN});

function scaleUpHeroku() {
    heroku.apps(process.env.HEROKU_APP_NAME).formation('worker').update({quantity: '1'}, function (err, app) {
        if(err) throw err;
        console.log(getDateAndTime() + '~ Scaled up ' + process.env.HEROKU_APP_NAME);
    });
}

function getDateAndTime() {
    var d = (new Date()).toString();
    var date_time_patt = /.+ .+ .+ .+ [0-9]{2}:[0-9]{2}/;
    d = d.match(date_time_patt)[0];
    return d;
}

scaleUpHeroku();