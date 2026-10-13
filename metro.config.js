// https://docs.expo.dev/guides/customizing-metro/
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// three ≥ r180 é só ESM: o build CommonJS (three.cjs) chama process.emitWarning, que não existe no
// React Native e quebra o app no carregamento ("undefined is not a function"). O R3F nativo usa
// require('three'), então redirecionamos qualquer import de 'three' para o módulo ES.
const threeModule = path.resolve(__dirname, 'node_modules/three/build/three.module.js');
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'three') {
    return { type: 'sourceFile', filePath: threeModule };
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
