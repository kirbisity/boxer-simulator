// The town kit's door to the open air (env/): the page loads this (render.js), and through it a kit place describes
// itself to the open air, has its day's weather put on, and makes weathers of its own (place.js TK_AIR, tkKeep's
// `air`). Kept apart from the kit so that the kit and the places built with it load where the open air cannot (the
// tests' node has no renderer; the custom page carries neither).

import { envPlaceWeather, envRegisterPlace, envRegisterWeather } from '../env/index.js';
import { TK_AIR } from './place.js';

TK_AIR.place = envRegisterPlace;
TK_AIR.weather = envPlaceWeather;
TK_AIR.newWeather = envRegisterWeather;
