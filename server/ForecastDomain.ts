export interface AreaForecast {
  publishTime: Date,
  pointForecasts: PointForecast[]
}

export interface PointForecast extends Coords {
  publishTime: Date,
  forecastItems: ForecastItem[]
}

export interface ForecastItem {
  prate: number,
  windSpeedMs: number,
  windDir: number,
  pressureMbar: number,
  time: Date
}

export interface Bounds {
  swCorner: Coords,
  neCorner: Coords
}

export interface Coords {
  latitude: number,
  longitude: number
}

export interface ObservationItem {
  time: Date,
  temperature: number,
  windSpeedMs: number,
  windGustMs: number,
  windDir: number,
  pressureMbar: number
}

export interface StationObservation {
  station: ObservationStation,
  observations: ObservationItem[]
}

export interface ObservationStation extends Coords {
  geoid: string,
  name: string
}

export interface NearestObservationStation extends ObservationStation {
  distanceMeters: number
}
