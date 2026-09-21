// Static requires so serverless hosts (Vercel) include the data files in the deployed bundle.
module.exports = {
  actors: require('../data/actors.json'),
  locations: require('../data/locations.json')
};
