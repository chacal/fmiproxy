export interface PointForecast {
  publishTime: Date,
  lat: number,
  lng: number,
  forecastItems: ForecastItem[]
}

export interface ForecastItem {
  prate: number,
  windSpeedMs: number,
  windDir: number,
  pressureMbar: number,
  time: Date
}

export interface Coords {
  lat: number,
  lng: number
}