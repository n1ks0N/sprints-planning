const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
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
  plugins: [
    ...(common.plugins || []),
    new HtmlWebpackPlugin({
      template: 'public/index.html',
      filename: path.resolve(__dirname, 'ISU/index.html'),
    }),
  ],
};
