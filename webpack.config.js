const path = require('path');
const common = require('./webpack.common');

module.exports = {
  ...common,
  output: {
    filename: 'bundle.[contenthash].js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
    publicPath: '/',
  },
  devServer: {
    static: path.join(__dirname, 'public'),
    historyApiFallback: true,
    port: 5173,
    proxy: [
      { context: ['/api'], target: 'http://localhost:8080', changeOrigin: true },
    ],
  },
};
