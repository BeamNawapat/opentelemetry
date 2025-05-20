import { Elysia } from 'elysia';
import { type ContextManager, type Context, type SpanOptions, type Span, type Attributes, TraceAPI } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
type OpenTeleMetryOptions = NonNullable<ConstructorParameters<typeof NodeSDK>[0]>;
/**
 * Initialize OpenTelemetry SDK
 *
 * For best practice, you should be using preload OpenTelemetry SDK if possible
 * however, this is a simple way to initialize OpenTelemetry SDK
 */
export interface ElysiaOpenTelemetryOptions extends OpenTeleMetryOptions {
    contextManager?: ContextManager;
}
export type ActiveSpanArgs<F extends (span: Span) => unknown = (span: Span) => unknown> = [name: string, fn: F] | [name: string, options: SpanOptions, fn: F] | [name: string, options: SpanOptions, context: Context, fn: F];
export type Tracer = ReturnType<TraceAPI['getTracer']>;
export type StartSpan = Tracer['startSpan'];
export type StartActiveSpan = Tracer['startActiveSpan'];
export declare const contextKeySpan: unique symbol;
export declare const getTracer: () => ReturnType<TraceAPI["getTracer"]>;
export declare const startActiveSpan: StartActiveSpan;
export declare const record: {
    <F extends (span: Span) => unknown>(name: string, fn: F): ReturnType<F>;
    <F extends (span: Span) => unknown>(name: string, options: SpanOptions, fn: F): ReturnType<F>;
    <F extends (span: Span) => unknown>(name: string, options: SpanOptions, context: Context, fn: F): ReturnType<F>;
};
export declare const getCurrentSpan: () => Span | undefined;
/**
 * Set attributes to the current span
 *
 * @returns boolean - whether the attributes are set or not
 */
export declare const setAttributes: (attributes: Attributes) => boolean;
export declare const opentelemetry: ({ serviceName, instrumentations, contextManager, ...options }?: ElysiaOpenTelemetryOptions) => Elysia<"", false, {
    decorator: {};
    store: {};
    derive: {};
    resolve: {};
}, {
    type: {};
    error: {};
}, {
    schema: {};
    macro: {};
    macroFn: {};
}, {}, {
    derive: {};
    resolve: {};
    schema: {};
}, {
    derive: {};
    resolve: {};
    schema: {};
}>;
export {};
