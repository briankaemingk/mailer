function scaleDownHeroku() {

    console.log(process.env.USER);

    var Heroku = require('heroku-client'),
        heroku = new Heroku({ token:process.env.HEROKU_API_TOKEN });

    heroku.apps().list(function (err, apps) {
        // `apps` is a parsed JSON response from the API
        if(err) throw err;
        console.log(apps);
    });

}
scaleDownHeroku();