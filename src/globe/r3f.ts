import { LogBox } from 'react-native';

// O R3F 9 ainda cria um THREE.Clock internamente (obsoleto no three r186). Inofensivo; remover quando o R3F migrar para THREE.Timer.
LogBox.ignoreLogs(['THREE.Clock: This module has been deprecated']);

// Android/iOS: Canvas sobre expo-gl (com polyfills de carregamento de texturas do R3F nativo).
export { Canvas, useFrame, useThree } from '@react-three/fiber/native';
