require('dotenv').config();
const axios = require('axios');

async function tmdbAPICall({path, queryParams}) {
  let url = `${process.env.TMDB_BASE_URL}${path}?api_key=${process.env.TMDB_API_KEY}`;
  url += '&' + Object.keys(queryParams).map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(queryParams[key])}`).join('&');
  return await axios.get(url);
}

async function searchMovie(movieName) {
  const data = await tmdbAPICall({
    path: 'search/movie',
    queryParams: {
      query: movieName
    }
  });

  return data.data.results.reduce((list, movie) => {
    return list.concat([{
      movieTitle: movie.title,
      movieYear: movie.release_date.substr(0, 4),
    }])
  }, [])
}

module.exports = {
  searchMovie,
};
