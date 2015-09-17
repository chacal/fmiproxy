var express = require('express')
var Promise = require('bluebird')
var APIKey = require('./apikey')
var geocode = require('./server/reverse_geocode.js')
var gribParser = require('./server/grib_get_parser')

var HIRLAM_GRIB_FILE = 'hirlam_20150827-063947.grb'

var app = express()
app.set('port', (process.env.PORT || 8000))

geocode.init(APIKey.key).then(startServer)

function startServer() {
  app.get("/nearest-station", function(req, res, next) {
    res.json(geocode.getNearestStation(req.query.lat, req.query.lon)).end()
  })

  app.get("/hirlam-forecast", function(req, res, next) {
    gribParser.getForecastFromGrib(HIRLAM_GRIB_FILE, req.query.lat, req.query.lon)
      .then(function(forecast) { res.json(forecast).end() })
      .catch(next)
  })

  app.listen(app.get('port'), function() {
    console.log("FMI proxy is running at localhost:" + app.get('port'))
  })

  app.use(function (err, req, res, next) {
    console.log(err)
    res.status(err.status || 500)
    res.json({
      message: err.message,
      error: err
    })
  })
}
