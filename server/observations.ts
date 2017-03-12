var _ = require('lodash')
var utils = require('./utils')

module.exports = function(apiKey) {
  var baseUrl = 'http://data.fmi.fi/fmi-apikey/' + apiKey + '/wfs?request=getFeature&storedquery_id=fmi::observations::weather::multipointcoverage&parameters=temperature,windspeedms,windgust,winddirection,pressure'

  function observationUrlForGeoid(geoid) { return baseUrl + '&geoid=' + geoid }
  function observationUrlForPlace(place) { return baseUrl + '&place=' + place }

  return {

    getObservationsForGeoid: function(geoid) {
      return utils.getFmiXMLasJson(observationUrlForGeoid(geoid)).then(parseObservationsResponse)
    },

    getObservationsForPlace: function(place) {
      return utils.getFmiXMLasJson(observationUrlForPlace(place)).then(parseObservationsResponse)
    }

  }

  function parseObservationsResponse(json) {
    var gridSeriesObservation = _.get(json, 'wfs:FeatureCollection.wfs:member[0].omso:GridSeriesObservation[0]')
    var geoid = utils.getGeoidFromGridSeriesObservation(gridSeriesObservation)

    var gmlPoint = _.get(gridSeriesObservation, 'om:featureOfInterest[0].sams:SF_SpatialSamplingFeature[0].sams:shape[0].gml:MultiPoint[0].gml:pointMember[0].gml:Point[0]')
    var stationInfo = utils.getStationInfoFromGmlPoint(gmlPoint)

    var pathStart = 'om:result[0].gmlcov:MultiPointCoverage[0]'
    var values = _.get(gridSeriesObservation, pathStart + '.gml:rangeSet[0].gml:DataBlock[0].gml:doubleOrNilReasonTupleList[0]')
    var metadata = _.get(gridSeriesObservation, pathStart + 'gml:domainSet[0].gmlcov:SimpleMultiPoint[0].gmlcov:positions[0]')
    var dataLines = _.map(values.trim().split(/\n/), function(line) { return line.trim() })
    var metadataLines = _.map(metadata.trim().split(/\n/), function(line) { return line.trim() })
    var observationData = _.zipWith(dataLines, metadataLines, function(data, metadata) { return data + ' ' + metadata })

    var observations = _.map(observationData, function(observationLine) {
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

    return _.extend({ geoid: geoid }, stationInfo, { observations: observations })
  }
}