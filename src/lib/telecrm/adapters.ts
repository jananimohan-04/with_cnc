// Browser side of the provider layer. The phone context (phone.tsx) talks only to this interface;
// each provider's browser library is loaded on demand, only for people set up as telecallers.

export interface PhoneCallHandle {
  /** Values the server attached to the call (callRef = our call record id, callerNumber). */
  params: Record<string, string>;
  accept(): void;
  reject(): void;
  hangup(): void;
  mute(on: boolean): void;
  isMuted(): boolean;
  on(event: 'accept' | 'disconnect' | 'cancel' | 'reject' | 'error' | 'ringing', fn: (arg?: unknown) => void): void;
}

export interface PhoneDevice {
  register(): Promise<void>;
  unregister(): Promise<void>;
  connect(params: Record<string, string>): Promise<PhoneCallHandle>;
  updateToken(token: string): void;
  destroy(): void;
  on(event: 'incoming', fn: (call: PhoneCallHandle) => void): void;
  on(event: 'tokenWillExpire' | 'registered' | 'unregistered', fn: () => void): void;
  on(event: 'error', fn: (err: { message?: string }) => void): void;
}

type Factory = (token: string, opts: { edge?: string }) => Promise<PhoneDevice>;

// Twilio Voice SDK (WebRTC). Its Call / Device objects already match the handle shape closely.
const twilio: Factory = async (token, opts) => {
  const { Device } = await import('@twilio/voice-sdk');
  const device = new Device(token, {
    edge: opts.edge || undefined,
    closeProtection: 'A call is in progress. Leave anyway?',
    logLevel: 'error',
  } as ConstructorParameters<typeof Device>[1]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrap = (c: any): PhoneCallHandle => {
    const custom: Record<string, string> = {};
    try { c.customParameters?.forEach?.((v: string, k: string) => { custom[k] = v; }); } catch { /* none */ }
    return {
      params: { ...(c.parameters || {}), ...custom },
      accept: () => c.accept(),
      reject: () => c.reject(),
      hangup: () => c.disconnect(),
      mute: (on) => c.mute(on),
      isMuted: () => !!c.isMuted(),
      on: (ev, fn) => c.on(ev, fn),
    };
  };
  return {
    register: () => device.register(),
    unregister: () => device.unregister(),
    connect: async (params) => wrap(await device.connect({ params })),
    updateToken: (t) => device.updateToken(t),
    destroy: () => device.destroy(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on: (ev: string, fn: any) => { device.on(ev, ev === 'incoming' ? (c: unknown) => fn(wrap(c)) : fn); },
  } as PhoneDevice;
};

const FACTORIES: Record<string, Factory> = { twilio };

export async function createPhoneDevice(provider: string, token: string, opts: { edge?: string }): Promise<PhoneDevice> {
  const make = FACTORIES[provider];
  if (!make) throw new Error('Browser calling is not available for the configured phone provider.');
  return make(token, opts);
}
