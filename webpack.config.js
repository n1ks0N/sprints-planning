const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const common = require('./webpack.common');

const API_URL = process.env.API_URL || '/api/v1/sprints-planning';
const shouldProxy = API_URL.startsWith('/');

module.exports = {
  ...common,
  output: {
    filename: 'bundle.[contenthash].js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
    publicPath: '/',
  },
  plugins: [
    ...(common.plugins || []),
    new HtmlWebpackPlugin({ template: 'public/index.html' }),
  ],
  devServer: {
    static: path.join(__dirname, 'public'),
    historyApiFallback: true,
    port: 5173,
    proxy: shouldProxy
      ? [{ context: [API_URL], target: 'http://localhost:8080', changeOrigin: true }]
      : [],
  },
};
