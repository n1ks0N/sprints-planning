
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

const USE_MOCK = process.env.USE_MOCK === 'true';
const API_URL = process.env.API_URL || '/api';

module.exports = {
  entry: './src/main.tsx',
  output: {
    filename: 'bundle.[contenthash].js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
    publicPath: '/',
  },
  devtool: 'source-map',
  resolve: { extensions: ['.tsx', '.ts', '.js'] },
  module: {
    rules: [{ test: /\.tsx?$/, use: 'ts-loader', exclude: /node_modules/ }],
  },
  devServer: {
    static: path.join(__dirname, 'public'),
    historyApiFallback: true,
    port: 5173,
    proxy: [
      { context: ['/api'], target: 'http://localhost:8080', changeOrigin: true },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({ template: 'public/index.html' }),
    new webpack.DefinePlugin({
      'process.env.USE_MOCK': JSON.stringify(USE_MOCK ? 'true' : 'false'),
      'process.env.API_URL': JSON.stringify(API_URL),
    }),
  ],
  optimization: { splitChunks: { chunks: 'all' } },
};
