var Promise = require('bluebird')
var request = Promise.promisifyAll(require('request'))
var xml2js = Promise.promisifyAll(require('xml2js'))
var _ = require('lodash')
var geolib = require('geolib')
var moment = require('moment')
var utils = require('./utils')
var xpath = require('xpath')
var dom = require('xmldom').DOMParser

var observationStations = []

function init(apiKey) {
  console.log("Updating observation station cache..")
  var lastFullHour = moment().minutes(0).seconds(0).utc().format("YYYY-MM-DDTHH:mm:ss") + "Z"
  var observationsUrl = 'http://data.fmi.fi/fmi-apikey/' + apiKey + '/wfs?request=getFeature&storedquery_id=fmi::forecast::hirlam::surface::obsstations::multipointcoverage&parameters=temperature&starttime=' + lastFullHour + '&endtime=' + lastFullHour

  return request.getAsync(observationsUrl)
    .spread(function(res, body) {
      var doc = new dom().parseFromString(body.toString())
      var select = xpath.useNamespaces({
        target: 'http://xml.fmi.fi/namespace/om/atmosphericfeatures/1.0',
        gml: 'http://www.opengis.net/gml/3.2',
        xlink: 'http://www.w3.org/1999/xlink'
      })
      var locationNodes = select("//target:Location", doc)
      return _.map(locationNodes, function(locationNode) {
        var name = select('./gml:name[@codeSpace="http://xml.fmi.fi/namespace/locationcode/name"]/text()', locationNode).toString()
        var geoid = select('./gml:name[@codeSpace="http://xml.fmi.fi/namespace/locationcode/geoid"]/text()', locationNode).toString()
        var poinRef = select('./target:representativePoint/@xlink:href', locationNode, true).value.substr(1)
        var position = select('//gml:Point[@gml:id="' + poinRef + '"]/gml:pos/text()', doc, true).toString()
        return _.extend( { geoid: geoid, name: name }, utils.locationFromPositionString(position))
      })
    })
    .then(function(stations) {
      observationStations = stations
      console.log("Loaded " + stations.length + " observation stations.")
    })
}

function getNearestStation(latitude, longitude) {
  var nearest = geolib.findNearest({latitude: latitude, longitude: longitude}, observationStations)
  return _.extend({ distanceMeters: nearest.distance }, observationStations[nearest.key])
}

module.exports = {
  init: init,
  getNearestStation: getNearestStation
}
