import { useState, useEffect, useRef, useCallback } from "react";

export function useWebSocket(url, maxRetries = 5) {
  const [updates, setUpdates] = useState({});
  const socketRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeout = useRef(null);
  const manuallyClosed = useRef(false);
  const heartbeatInterval = useRef(null);
  const missedPings = useRef(0);
  const [connectionStatus, setConnectionStatus] = useState('connecting');

  const MAX_MISSED_PINGS = 5;
  const GRACE_PERIOD = 15000;

  const connectWebSocket = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.onclose = null;
      socketRef.current.close();
    }

    console.log("Connecting to WebSocket...", url);
    const ws = new WebSocket(url);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket Connected");
      setConnectionStatus('connected');
      reconnectAttempts.current = 0;
      missedPings.current = 0;

      if (heartbeatInterval.current) {
        clearInterval(heartbeatInterval.current);
      }
      heartbeatInterval.current = setInterval(() => {
        if (missedPings.current >= MAX_MISSED_PINGS) {
          console.warn(`No pong received after ${MAX_MISSED_PINGS} tries. Waiting for ${GRACE_PERIOD/1000}s...`);
          setConnectionStatus('disconnected');
          const graceTimeout = setTimeout(() => {
            if (missedPings.current >= MAX_MISSED_PINGS) {
              console.warn("No pong after grace period. Closing WebSocket...");
              socketRef.current?.close();
            }
          }, GRACE_PERIOD);
          const cancelReconnect = () => {
            console.log("Pong received within grace period. Cancelling forced close.");
            clearTimeout(graceTimeout);
            window.removeEventListener("pongReceived", cancelReconnect);
            setConnectionStatus('connected');
          };
          window.addEventListener("pongReceived", cancelReconnect, { once: true });
        } else {
          console.log("Sending ping...");
          socketRef.current?.send(JSON.stringify({ type: "ping" }));
          missedPings.current++;
          if (missedPings.current > 1) {
            setConnectionStatus('unstable');
          }
        }
      }, 30000);
    };

    ws.onmessage = (event) => {
      if (socketRef.current !== ws) return;
      let messageData;
      try {
        messageData = JSON.parse(event.data);
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
        return;
      }
      missedPings.current = 0;
      if (connectionStatus !== 'connected') {
        setConnectionStatus('connected');
      }
      if (messageData.type === "pong") {
        console.log("Pong received! Resetting missed pings.");
        window.dispatchEvent(new Event("pongReceived"));
        return;
      }
      if (messageData.type === "ping") {
        console.log("Server sent a ping; sending pong...");
        socketRef.current?.send(JSON.stringify({ type: "pong" }));
        return;
      }
      if (messageData.event === "update" && messageData.data) {
        const uniqueRef = messageData.data.unique_reference || messageData.data.id || messageData.data.event_id;
        if (uniqueRef) {
          setUpdates((prevUpdates) => ({
            ...prevUpdates,
            [uniqueRef]: messageData.data,
          }));
        } else {
          console.warn("Received update with no unique_reference:", messageData);
        }
      }
    };

    ws.onerror = (error) => {
      if (socketRef.current !== ws) return;
      console.error("WebSocket Error:", error);
      setConnectionStatus('error');
      console.log("If you're seeing connection issues, please check that this domain is allowed in the application settings.");
    };

    ws.onclose = (event) => {
      if (socketRef.current !== ws) return;
      if (event.code === 4003) {
        console.error("WebSocket connection rejected: Origin not allowed");
        manuallyClosed.current = true;
        return;
      }
      console.warn("WebSocket Disconnected", {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
        manuallyClosed: manuallyClosed.current,
        reconnectAttempts: reconnectAttempts.current,
      });
      setConnectionStatus('disconnected');
      if (heartbeatInterval.current) {
        clearInterval(heartbeatInterval.current);
        heartbeatInterval.current = null;
      }
      if (manuallyClosed.current) return;
      const isCloudFlareRestart = event.reason && event.reason.includes("CloudFlare") && event.reason.includes("proxy");
      if (!event.wasClean || isCloudFlareRestart) {
        if (!navigator.onLine) {
          console.warn("Device is offline. Pausing reconnection attempts...");
          window.addEventListener("online", () => {
            console.log("Device is back online. Reconnecting WebSocket...");
            connectWebSocket();
          }, { once: true });
          return;
        }
        if (reconnectAttempts.current >= maxRetries) {
          console.error("Max WebSocket reconnect attempts reached. Stopping retries.");
          return;
        }
        const delay = Math.min(5000, 3000 * (2 ** reconnectAttempts.current));
        reconnectAttempts.current++;
        console.warn(`Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts.current})...`);
        if (reconnectTimeout.current) {
          clearTimeout(reconnectTimeout.current);
        }
        reconnectTimeout.current = setTimeout(() => {
          if (!manuallyClosed.current) {
            console.warn("Triggering WebSocket reconnection...");
            connectWebSocket();
          }
        }, delay);
      } else {
        console.log("WebSocket closed cleanly. No reconnection necessary.");
      }
    };
  }, [url, maxRetries]);

  useEffect(() => {
    manuallyClosed.current = false;
    connectWebSocket();

    return () => {
      manuallyClosed.current = true;
      if (socketRef.current) {
        console.log("Cleaning up WebSocket on component unmount...");
        socketRef.current.close();
        socketRef.current = null;
      }
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }
      if (heartbeatInterval.current) {
        clearInterval(heartbeatInterval.current);
        heartbeatInterval.current = null;
      }
    };
  }, [connectWebSocket]);

  const sendMessage = (message) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    } else {
      console.error("Cannot send message; WebSocket is not open.");
    }
  };

  return { updates, sendMessage, connectionStatus };
}