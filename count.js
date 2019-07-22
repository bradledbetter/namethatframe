const fs = require('fs');
const buffer = fs.readFileSync(`movies.json`);
const moviedb = JSON.parse(buffer.toString());
const ct = moviedb.movies.filter((m) => m.movieYear && m.movieTitle).length;
console.info(`\nThere are ${ct} movies in the db.\n`);
