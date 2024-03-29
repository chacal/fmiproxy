import xpath = require('xpath')
import * as R from 'ramda'
import { DOMParser } from 'xmldom'
import fetch from 'node-fetch'
import { findNearest, getDistance } from 'geolib'
import { format, startOfHour } from 'date-fns'
import { convertToTimeZone } from 'date-fns-timezone'

import { NearestObservationStation, ObservationStation } from './ForecastDomain'
import * as Utils from './Utils'
import { logger } from './Logging'

const marineStationNames = require('../marine-observation-stations').map(R.prop('name'))

let observationStations: ObservationStation[] = []
let marineObservationStations: ObservationStation[] = []

export function init(): Promise<void> {
  logger.info('Updating observation station cache..')
  const lastFullHour = format(startOfHour(convertToTimeZone(new Date(), { timeZone: 'UTC' })), 'yyyy-MM-dd\'T\'HH:mm:ss\'Z\'')
  const observationsUrl = 'http://opendata.fmi.fi/wfs?request=getFeature&storedquery_id=ecmwf::forecast::surface::obsstations::multipointcoverage&parameters=temperature&starttime=' + lastFullHour + '&endtime=' + lastFullHour

  return fetch(observationsUrl)
    .then(res => res.text())
    .then(body => {
      const doc = new DOMParser().parseFromString(body)
      const select = xpath.useNamespaces({
        target: 'http://xml.fmi.fi/namespace/om/atmosphericfeatures/1.1',
        gml: 'http://www.opengis.net/gml/3.2',
        xlink: 'http://www.w3.org/1999/xlink'
      })
      const locationNodes = select('//target:Location', doc)
      return locationNodes.map(createObservationStation)

      function createObservationStation(locationNode: Node): ObservationStation {
        const name = select('./gml:name[@codeSpace="http://xml.fmi.fi/namespace/locationcode/name"]/text()', locationNode).toString()
        const geoid = select('./gml:name[@codeSpace="http://xml.fmi.fi/namespace/locationcode/geoid"]/text()', locationNode).toString()
        const poinRef = select('./target:representativePoint/@xlink:href', locationNode, true) as Attr
        const position = select('//gml:Point[@gml:id="' + poinRef.value.substr(1) + '"]/gml:pos/text()', doc, true).toString()
        const { latitude, longitude } = Utils.coordinatesFromPositionString(position)
        return { geoid, name, latitude, longitude }
      }
    })
    .then(stations => {
      observationStations = stations
      marineObservationStations = observationStations.filter(s => R.contains(s.name, marineStationNames))
      logger.info(`Loaded ${stations.length} observation stations (${marineObservationStations.length} marine).`)
    })
}

export function getNearestStation(latitude: number, longitude: number, marineStationsOnly: boolean = false): NearestObservationStation {
  const haystack = marineStationsOnly ? marineObservationStations : observationStations
  const nearest = findNearest({ latitude, longitude }, haystack) as ObservationStation
  const distanceMeters = getDistance({ latitude, longitude }, nearest)
  return R.merge({ distanceMeters }, nearest)
}
