const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

const USE_MOCK = process.env.USE_MOCK === 'true';
const API_URL = process.env.API_URL || '/api';

module.exports = {
  entry: './src/main.tsx',
  devtool: 'source-map',
  resolve: { extensions: ['.tsx', '.ts', '.js'] },
  module: {
    rules: [{ test: /\.tsx?$/, use: 'ts-loader', exclude: /node_modules/ }],
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
