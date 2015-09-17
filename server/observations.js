var Promise = require('bluebird')
var request = Promise.promisifyAll(require('request'))
var xml2js = Promise.promisifyAll(require('xml2js'))
var _ = require('lodash')

module.exports = function(apiKey) {
  var baseUrl = 'http://data.fmi.fi/fmi-apikey/' + apiKey + '/wfs?request=getFeature&storedquery_id=fmi::observations::weather::multipointcoverage&parameters=temperature,windspeedms,windgust,winddirection,pressure'

  function observationUrlForGeoid(geoid) { return baseUrl + '&geoid=' + geoid }
  function observationUrlForPlace(place) { return baseUrl + '&place=' + place }

  return {

    getObservationsForGeoid: function(geoid) {
      return request.getAsync(observationUrlForGeoid(geoid)).spread(parseObservationsResponse)
    },

    getObservationsForPlace: function(place) {
      return request.getAsync(observationUrlForPlace(place)).spread(parseObservationsResponse)
    }

  }

  function parseObservationsResponse(res, body) {
    return xml2js.parseStringAsync(body)
      .then(function(json) {
        var pathStart = 'wfs:FeatureCollection.wfs:member[0].omso:GridSeriesObservation[0].om:result[0].gmlcov:MultiPointCoverage[0]'
        var values = _.get(json, pathStart + '.gml:rangeSet[0].gml:DataBlock[0].gml:doubleOrNilReasonTupleList[0]')
        var metadata = _.get(json, pathStart + 'gml:domainSet[0].gmlcov:SimpleMultiPoint[0].gmlcov:positions[0]')
        var dataLines = _.map(values.trim().split(/\n/), function(line) { return line.trim() })
        var metadataLines = _.map(metadata.trim().split(/\n/), function(line) { return line.trim() })
        return _.zipWith(dataLines, metadataLines, function(data, metadata) { return data + ' ' + metadata })
      })
      .then(function(observationData) {
        return _.map(observationData, function(observationLine) {
          var parts = _.filter(observationLine.split(/ /), function(line) { return line.trim() !== '' })
          return {
            temperature: parseFloat(parts[0]),
            windSpeedMs: parseFloat(parts[1]),
            windGustMs: parseFloat(parts[2]),
            windDir: Math.round(parseFloat(parts[3])),
            pressureMbar: parseFloat(parts[4]),
            time: new Date(parseInt(parts[7]) * 1000)
          }
        })
      })
  }
}