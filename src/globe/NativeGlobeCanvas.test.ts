import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ extend: vi.fn() }));

vi.mock('three', () => ({ Color: class Color {} }));
vi.mock('@react-three/fiber/native', () => ({
  createRoot: vi.fn(),
  extend: mocks.extend,
  unmountComponentAtNode: vi.fn(),
}));
vi.mock('expo-gl', () => ({
  GLView: class GLView {
    _onSurfaceCreate() {}
  },
}));
vi.mock('react-native', () => ({
  PixelRatio: { get: () => 1 },
  StyleSheet: { absoluteFill: {}, create: (styles: unknown) => styles },
  View: () => null,
}));

describe('NativeGlobeCanvas R3F registration', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.extend.mockClear();
  });

  it('registers Three elements before a native root can render the scene', async () => {
    await import('./NativeGlobeCanvas');

    expect(mocks.extend).toHaveBeenCalledTimes(1);
    expect(mocks.extend).toHaveBeenCalledWith(expect.objectContaining({ Color: expect.any(Function) }));
  });
});
