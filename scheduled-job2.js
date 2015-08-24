var Heroku = require('heroku.node');

function scaleDownHeroku() {

    var client = new Heroku({email: process.env.USER, api_key: process.env.HEROKU_API_TOKEN});
    client.app(process.env.HEROKU_APP_NAME).dynos.scale('worker', 1, function () {
        //LOGGED
        console.log(getDateAndTime() + '~ App scaled down to zero');
    });

}

function getDateAndTime() {
    var d = (new Date()).toString();
    var date_time_patt = /.+ .+ .+ .+ [0-9]{2}:[0-9]{2}/;
    d = d.match(date_time_patt)[0];
    return d;
}


scaleDownHeroku();