import fs from 'node:fs';
import {forecastOne} from '../src/forecast.mjs';
// Synthetic method reference only: no GreenCall observations, credentials or runtime dependencies.
fs.mkdirSync('work',{recursive:true});
const values=Array.from({length:30},(_,i)=>20+i*.4+[0,2,-1,1,-2][i%5]);
const months=values.map((_,i)=>new Date(Date.UTC(2024,i,1)).toISOString().slice(0,7));
fs.writeFileSync('work/forecast-reference-input.json',JSON.stringify({synthetic:true,values,months,forecast:forecastOne(values,months,12)}));
