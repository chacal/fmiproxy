var express = require('express')
var geocode = require('./reverse_geocode.js')
var Promise = require('bluebird')
var APIKey = require('./apikey')

var app = express()
app.set('port', (process.env.PORT || 8000))

geocode.init(APIKey.key).then(startServer)

function startServer() {
  app.get("/nearest-station", function(req, res, next) {
    res.json(geocode.getNearestStation(req.query.lat, req.query.lon)).end()
  })

  app.listen(app.get('port'), function() {
    console.log("FMI proxy is running at localhost:" + app.get('port'))
  })
}
