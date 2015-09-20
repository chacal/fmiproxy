var Promise = require('bluebird')
var request = Promise.promisifyAll(require('request'))
var xml2js = Promise.promisifyAll(require('xml2js'))
var _ = require('lodash')
var geolib = require('geolib')
var moment = require('moment')
var utils = require('./utils')

var observationStations = []

function init(apiKey) {
  console.log("Updating observation station cache..")
  var lastFullHour = moment().minutes(0).seconds(0).utc().format("YYYY-MM-DDTHH:mm:ss") + "Z"
  var observationsUrl = 'http://data.fmi.fi/fmi-apikey/' + apiKey + '/wfs?request=getFeature&storedquery_id=fmi::forecast::hirlam::surface::obsstations::multipointcoverage&parameters=temperature&starttime=' + lastFullHour + '&endtime=' + lastFullHour

  return utils.getFmiXMLasJson(observationsUrl)
    .then(function(json) {
      var observations = json['wfs:FeatureCollection']['wfs:member']
      return _.map(observations, function(observation) {
        var gmlPoint = _.get(observation, 'omso:GridSeriesObservation[0].om:featureOfInterest[0].sams:SF_SpatialSamplingFeature[0].sams:shape[0].gml:MultiPoint[0].gml:pointMembers[0].gml:Point[0]')
        var name = gmlPoint['gml:name'][0]
        var geoid = gmlPoint['$']['gml:id'].substring(6)
        var location = gmlPoint['gml:pos'][0].trim()
        var latitude = location.substr(0, location.indexOf(' '))
        var longitude = location.substr(location.indexOf(' ') + 1)
        return {name: name, geoid: geoid, latitude: parseFloat(latitude), longitude: parseFloat(longitude)}
      })
    })
    .then(function(stations) {
      observationStations = stations
      console.log("Loaded " + stations.length + " observation stations.")
    })
}

function getNearestStation(latitude, longitude) {
  var nearest = geolib.findNearest({latitude: latitude, longitude: longitude}, observationStations)
  return observationStations[nearest.key]
}

module.exports = {
  init: init,
  getNearestStation: getNearestStation
}
