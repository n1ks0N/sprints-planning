const webpack = require('webpack');

const API_URL = process.env.API_URL || '/api/v1/sprints-planning';

module.exports = {
  entry: './src/index.ts',
  devtool: 'source-map',
  resolve: { extensions: ['.tsx', '.ts', '.js'] },
  module: {
    rules: [{ test: /\.tsx?$/, use: 'ts-loader', exclude: /node_modules/ }],
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.API_URL': JSON.stringify(API_URL),
    }),
  ],
  optimization: { splitChunks: { chunks: 'all' } },
};
