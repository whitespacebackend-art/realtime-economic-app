import React, { useState, useEffect } from 'react';
import axios from 'axios';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import usewebsocket from './usewebsocket';
import './App.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:5000';

function App() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date('2025-09-19'));
  const { updates, connectionStatus } = useWebSocket(WS_URL);

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      const gte = selectedDate.toISOString().split('T')[0] + 'T00:00:00Z';
      const lte = new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T23:59:59Z';
      let allEvents = [];
      let url = `${API_BASE}/calendar-event-refinitiv/?timestamp_gte=${gte}&timestamp_lte=${lte}`;

      try {
        while (url) {
          const response = await axios.get(url);
          allEvents = [...allEvents, ...response.data.results];
          url = response.data.next;
        }
        allEvents.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        setEvents(allEvents);
      } catch (error) {
        console.error('API Error:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, [selectedDate]);

  useEffect(() => {
    if (Object.keys(updates).length > 0) {
      setEvents((prevEvents) =>
        prevEvents.map((event) =>
          updates[event.unique_reference] ? { ...event, ...updates[event.unique_reference] } : event
        )
      );
    }
  }, [updates]);

  const getImpactColor = (impact) => {
    return impact === 1 ? '#888' : impact === 2 ? '#ffcc00' : '#ff4444';
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="app">
      <header>
        <h1>Realtime Economic Calendar</h1>
        <div className="status">Status: {connectionStatus}</div>
        <DatePicker
          selected={selectedDate}
          onChange={setSelectedDate}
          dateFormat="yyyy-MM-dd"
          className="date-picker"
        />
      </header>
      <div className="table-container">
        {events.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Currency</th>
                <th>Impact</th>
                <th>Event Name</th>
                <th>Actual</th>
                <th>Consensus</th>
                <th>Previous</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.unique_reference}>
                  <td>{new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td>{event.currency}</td>
                  <td>
                    <span className="impact-dot" style={{ backgroundColor: getImpactColor(event.impact) }}></span>
                  </td>
                  <td>{event.name}</td>
                  <td>{event.actual ?? '-'}</td>
                  <td>{event.consensus ?? '-'}</td>
                  <td>{event.previous ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No events for {selectedDate.toLocaleDateString()}.</p>
        )}
      </div>
    </div>
  );
}

export default App;