// src/index.ts
import { Elysia, StatusMap } from "elysia";
import {
  trace,
  context as otelContext,
  propagation,
  SpanStatusCode,
  ProxyTracer
} from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
var headerHasToJSON = typeof new Headers().toJSON === "function";
var parseNumericString = (message) => {
  if (message.length < 16) {
    if (message.length === 0) return null;
    const length = Number(message);
    if (Number.isNaN(length)) return null;
    return length;
  }
  if (message.length === 16) {
    const number = Number(message);
    if (number.toString() !== message || message.trim().length === 0 || Number.isNaN(number))
      return null;
    return number;
  }
  return null;
};
var createActiveSpanHandler = (fn) => function(span) {
  try {
    const result = fn(span);
    if (result instanceof Promise || typeof result?.then === "function")
      return result.then((result2) => {
        if (span.isRecording()) span.end();
        return result2;
      });
    if (span.isRecording()) span.end();
    return result;
  } catch (error) {
    if (!span.isRecording()) throw error;
    const err = error;
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err?.message
    });
    span.recordException(err);
    span.end();
    throw error;
  }
};
var createContext = (parent) => ({
  getValue() {
    return parent;
  },
  setValue() {
    return otelContext.active();
  },
  deleteValue() {
    return otelContext.active();
  }
});
var contextKeySpan = Symbol.for("OpenTelemetry Context Key SPAN");
var getTracer = () => {
  const tracer = trace.getTracer("Elysia");
  return {
    ...tracer,
    startSpan(name, options, context) {
      return tracer.startSpan(name, options, context);
    },
    startActiveSpan(...args) {
      switch (args.length) {
        case 2:
          return tracer.startActiveSpan(
            args[0],
            createActiveSpanHandler(args[1])
          );
        case 3:
          return tracer.startActiveSpan(
            args[0],
            args[1],
            createActiveSpanHandler(args[2])
          );
        case 4:
          return tracer.startActiveSpan(
            args[0],
            args[1],
            args[2],
            createActiveSpanHandler(args[3])
          );
      }
    }
  };
};
var startActiveSpan = (...args) => {
  const tracer = getTracer();
  switch (args.length) {
    case 2:
      return tracer.startActiveSpan(
        args[0],
        createActiveSpanHandler(args[1])
      );
    case 3:
      return tracer.startActiveSpan(
        args[0],
        args[1],
        createActiveSpanHandler(args[2])
      );
    case 4:
      return tracer.startActiveSpan(
        args[0],
        args[1],
        args[2],
        createActiveSpanHandler(args[3])
      );
  }
};
var record = startActiveSpan;
var getCurrentSpan = () => {
  const current = otelContext.active()._currentContext?.get(contextKeySpan);
  return current;
};
var setAttributes = (attributes) => {
  return !!getCurrentSpan()?.setAttributes(attributes);
};
var opentelemetry = ({
  serviceName = "Elysia",
  instrumentations,
  contextManager,
  ...options
} = {}) => {
  let tracer = trace.getTracer(serviceName);
  if (tracer instanceof ProxyTracer) {
    const sdk = new NodeSDK({
      ...options,
      serviceName,
      instrumentations
    });
    sdk.start();
    tracer = trace.getTracer(serviceName);
  } else {
  }
  if (!otelContext._getContextManager?.() && contextManager)
    try {
      contextManager.enable();
      otelContext.setGlobalContextManager(contextManager);
    } catch {
    }
  return new Elysia({
    name: "@elysia/opentelemetry"
  }).wrap((fn, request) => {
    const ctx = propagation.extract(otelContext.active(), request);
    return tracer.startActiveSpan(
      "request",
      {},
      propagation.extract(otelContext.active(), request),
      (rootSpan) => otelContext.bind(trace.setSpan(ctx, rootSpan), fn)
    );
  }).trace(
    { as: "global" },
    ({
      id,
      onRequest,
      onParse,
      onTransform,
      onBeforeHandle,
      onHandle,
      onAfterHandle,
      onError,
      onAfterResponse,
      onMapResponse,
      context,
      context: {
        path,
        request: { method }
      }
    }) => {
      const rootSpan = trace.getActiveSpan();
      if (!rootSpan) return;
      let parent = rootSpan;
      function setParent(span) {
        const newContext = trace.setSpan(otelContext.active(), span);
        const currentContext = (
          // @ts-expect-error private property
          otelContext.active()._currentContext
        );
        currentContext?.set(
          contextKeySpan,
          newContext.getValue(contextKeySpan)
        );
        parent = span;
      }
      function inspect(name) {
        return function inspect2({
          onEvent,
          total,
          onStop
        }) {
          if (total === 0) return;
          tracer.startActiveSpan(
            name,
            {},
            createContext(rootSpan),
            (event) => {
              onEvent(({ name: name2, onStop: onStop2 }) => {
                tracer.startActiveSpan(
                  name2,
                  {},
                  createContext(event),
                  (span) => {
                    setParent(span);
                    onStop2(({ error }) => {
                      if (error) {
                        rootSpan.setStatus({
                          code: SpanStatusCode.ERROR,
                          message: error.message
                        });
                        span.setAttributes({
                          "error.type": error.constructor?.name ?? error.name,
                          "error.stack": error.stack
                        });
                        span.setStatus({
                          code: SpanStatusCode.ERROR,
                          message: error.message
                        });
                        event.end();
                      } else {
                        rootSpan.setStatus({
                          code: SpanStatusCode.OK
                        });
                        span.setStatus({
                          code: SpanStatusCode.OK
                        });
                      }
                      span.end();
                    });
                  }
                );
              });
              onStop(() => {
                if (event.isRecording()) event.end();
                setParent(rootSpan);
              });
            }
          );
        };
      }
      context.trace = {
        startSpan(name) {
          return tracer.startSpan(name, {}, createContext(parent));
        },
        startActiveSpan(...args) {
          switch (args.length) {
            case 2:
              return tracer.startActiveSpan(
                args[0],
                {},
                createContext(parent),
                createActiveSpanHandler(args[1])
              );
            case 3:
              return tracer.startActiveSpan(
                args[0],
                args[1],
                createContext(parent),
                createActiveSpanHandler(args[2])
              );
            case 4:
              return tracer.startActiveSpan(
                args[0],
                args[1],
                args[2],
                createActiveSpanHandler(args[3])
              );
          }
        },
        setAttributes(attributes2) {
          rootSpan.setAttributes(attributes2);
        }
      };
      const url = context.url;
      const attributes = {
        // ? Elysia Custom attribute
        "http.request.id": id,
        "http.request.method": method,
        "url.path": path,
        "url.full": url
      };
      if (context.qi && context.qi !== -1)
        attributes["url.query"] = url.slice(
          // @ts-ignore private property
          context.qi + 1
        );
      const protocolSeparator = url.indexOf("://");
      if (protocolSeparator > 0)
        attributes["url.scheme"] = url.slice(0, protocolSeparator);
      onRequest(inspect("request"));
      onParse(inspect("parse"));
      onTransform(inspect("transform"));
      onBeforeHandle(inspect("beforeHandle"));
      onHandle(({ onStop }) => {
        const span = tracer.startSpan(
          "handle",
          {},
          createContext(rootSpan)
        );
        setParent(span);
        onStop(({ error }) => {
          if (error) {
            rootSpan.setStatus({
              code: SpanStatusCode.ERROR,
              message: error.message
            });
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: error.message
            });
            span.recordException(error);
            rootSpan.recordException(error);
          } else {
            rootSpan.setStatus({
              code: SpanStatusCode.OK
            });
            span.setStatus({
              code: SpanStatusCode.OK
            });
          }
          span.end();
        });
      });
      onAfterHandle(inspect("afterHandle"));
      onError(inspect("error"));
      onMapResponse(inspect("mapResponse"));
      onAfterResponse((event) => {
        inspect("afterResponse")(event);
        const {
          query,
          params,
          cookie,
          body,
          request,
          headers: parsedHeaders,
          response
        } = context;
        if (context.route) attributes["http.route"] = context.route;
        switch (typeof response) {
          case "object":
            if (response instanceof Response) {
            } else if (response instanceof Uint8Array)
              attributes["http.response.body.size"] = response.length;
            else if (response instanceof ArrayBuffer)
              attributes["http.response.body.size"] = response.byteLength;
            else if (response instanceof Blob)
              attributes["http.response.body.size"] = response.size;
            else {
              const value = JSON.stringify(response);
              attributes["http.response.body"] = value;
              attributes["http.response.body.size"] = value.length;
            }
            break;
          default:
            if (response === void 0 || response === null)
              attributes["http.response.body.size"] = 0;
            else {
              const value = response.toString();
              attributes["http.response.body"] = value;
              attributes["http.response.body.size"] = value.length;
            }
        }
        {
          let status = context.set.status;
          if (!status) status = 200;
          else if (typeof status === "string")
            status = StatusMap[status] ?? 200;
          attributes["http.response.status_code"] = status;
        }
        {
          let contentLength = request.headers.get("content-length");
          if (contentLength) {
            const number = parseNumericString(contentLength);
            if (number)
              attributes["http.request_content_length"] = number;
          }
        }
        {
          const userAgent = request.headers.get("User-Agent");
          if (userAgent)
            attributes["user_agent.original"] = userAgent;
        }
        const server = context.server;
        if (server) {
          attributes["server.port"] = server.port ?? 0;
          attributes["server.address"] = server.url.hostname;
          attributes["server.address"] = server.url.hostname;
        }
        let headers;
        {
          let hasHeaders;
          let _headers;
          if (context.headers) {
            hasHeaders = true;
            headers = context.headers;
            _headers = Object.entries(context.headers);
          } else if (hasHeaders = headerHasToJSON) {
            headers = request.headers.toJSON();
            _headers = Object.entries(headers);
          } else {
            headers = {};
            _headers = request.headers.entries();
          }
          for (let [key, value] of _headers) {
            key = key.toLowerCase();
            if (hasHeaders) {
              if (key === "user-agent") continue;
              if (typeof value === "object")
                attributes[`http.request.header.${key}`] = JSON.stringify(value);
              else if (value !== void 0)
                attributes[`http.request.header.${key}`] = value;
              continue;
            }
            if (typeof value === "object")
              headers[key] = attributes[`http.request.header.${key}`] = JSON.stringify(value);
            else if (value !== void 0) {
              if (key === "user-agent") {
                headers[key] = value;
                continue;
              }
              headers[key] = attributes[`http.request.header.${key}`] = value;
            }
          }
        }
        {
          let headers2;
          if (context.set.headers instanceof Headers) {
            if (headerHasToJSON)
              headers2 = Object.entries(
                // @ts-ignore bun only
                context.set.headers.toJSON()
              );
            else headers2 = context.set.headers.entries();
          } else headers2 = Object.entries(context.set.headers);
          for (let [key, value] of headers2) {
            key = key.toLowerCase();
            if (typeof value === "object")
              attributes[`http.response.header.${key}`] = JSON.stringify(value);
            else
              attributes[`http.response.header.${key}`] = value;
          }
        }
        if (context.ip)
          attributes["client.address"] = context.ip;
        else {
          const ip = server?.requestIP(request);
          if (ip) attributes["client.address"] = ip.address;
        }
        if (cookie) {
          const _cookie = {};
          for (const [key, value] of Object.entries(cookie))
            _cookie[key] = JSON.stringify(value);
          attributes["http.request.cookie"] = JSON.stringify(_cookie);
        }
        if (body !== void 0 && body !== null) {
          const value = typeof body === "object" ? JSON.stringify(body) : body.toString();
          attributes["http.request.body"] = value;
          if (typeof body === "object") {
            if (body instanceof Uint8Array)
              attributes["http.request.body.size"] = body.length;
            else if (body instanceof ArrayBuffer)
              attributes["http.request.body.size"] = body.byteLength;
            else if (body instanceof Blob)
              attributes["http.request.body.size"] = body.size;
            attributes["http.request.body.size"] = value.length;
          } else {
            attributes["http.request.body.size"] = value.length;
          }
        }
        rootSpan.setAttributes(attributes);
        event.onStop(() => {
          setParent(rootSpan);
          rootSpan.updateName(
            // @ts-ignore private property
            `${method} ${context.route || context.path}`
          );
          rootSpan.end();
        });
      });
    }
  );
};
export {
  contextKeySpan,
  getCurrentSpan,
  getTracer,
  opentelemetry,
  record,
  setAttributes,
  startActiveSpan
};
