const path = require('path');
const common = require('./webpack.common');

module.exports = {
  ...common,
  output: {
    filename: '[name].[contenthash].bundle.js',
    path: path.resolve(__dirname, 'ISU/dist'),
    publicPath: 'dist/',
    uniqueName: 'isu_sprints_planning',
    chunkFilename: '[name].[contenthash].chunk.js',
  },
};
