import requestP = require('request-promise')
var _ = require('lodash')
var geolib = require('geolib')
var moment = require('moment')
var utils = require('./utils')
var logger = require('./logging.js').console
var xpath = require('xpath')
import { DOMParser } from 'xmldom'

let observationStations = []

function init(apiKey) {
  logger.info("Updating observation station cache..")
  var lastFullHour = moment().minutes(0).seconds(0).utc().format("YYYY-MM-DDTHH:mm:ss") + "Z"
  var observationsUrl = 'http://data.fmi.fi/fmi-apikey/' + apiKey + '/wfs?request=getFeature&storedquery_id=fmi::forecast::hirlam::surface::obsstations::multipointcoverage&parameters=temperature&starttime=' + lastFullHour + '&endtime=' + lastFullHour

  return requestP.get(observationsUrl)
    .then(function(body) {
      const doc = new DOMParser().parseFromString(body.toString())
      const select = xpath.useNamespaces({
        target: 'http://xml.fmi.fi/namespace/om/atmosphericfeatures/1.0',
        gml: 'http://www.opengis.net/gml/3.2',
        xlink: 'http://www.w3.org/1999/xlink'
      })
      const locationNodes = select("//target:Location", doc)
      return locationNodes.map(locationNode => {
        const name = select('./gml:name[@codeSpace="http://xml.fmi.fi/namespace/locationcode/name"]/text()', locationNode).toString()
        const geoid = select('./gml:name[@codeSpace="http://xml.fmi.fi/namespace/locationcode/geoid"]/text()', locationNode).toString()
        const poinRef = select('./target:representativePoint/@xlink:href', locationNode, true).value.substr(1)
        const position = select('//gml:Point[@gml:id="' + poinRef + '"]/gml:pos/text()', doc, true).toString()
        return _.extend( { geoid: geoid, name: name }, utils.locationFromPositionString(position))
      })
    })
    .then(function(stations) {
      observationStations = stations
      logger.info("Loaded " + stations.length + " observation stations.")
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
