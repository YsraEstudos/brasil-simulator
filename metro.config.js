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

// expo-sqlite na web (desenvolvimento): o SQLite roda em WebAssembly e precisa de SharedArrayBuffer,
// que o navegador só libera com estes cabeçalhos de isolamento.
config.resolver.assetExts.push('wasm');
const enhance = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) => {
  const inner = enhance ? enhance(middleware, server) : middleware;
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    return inner(req, res, next);
  };
};

module.exports = config;
