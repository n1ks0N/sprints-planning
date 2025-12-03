const webpack = require('webpack');

const USE_MOCK = process.env.USE_MOCK === 'true';
const API_URL = process.env.API_URL || '/isu/isu_backend_common/sprints-planning';

module.exports = {
  entry: './src/index.ts',
  devtool: 'source-map',
  resolve: { extensions: ['.tsx', '.ts', '.js'] },
  module: {
    rules: [
      { test: /\.m?js$/, resolve: { fullySpecified: false } },
      { test: /\.tsx?$/, use: 'ts-loader', exclude: /node_modules/ },
    ],
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.USE_MOCK': JSON.stringify(USE_MOCK ? 'true' : 'false'),
      'process.env.API_URL': JSON.stringify(API_URL),
    }),
  ],
  optimization: { splitChunks: { chunks: 'all' } },
};
