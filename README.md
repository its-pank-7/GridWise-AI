# GridWise AI

### Know your energy. Predict what comes next. Act with confidence.

**GridWise AI** is an energy intelligence platform designed to monitor electricity consumption, detect unusual usage patterns, forecast future demand, estimate electricity costs, and instantly alert responsible personnel through email.

> [!IMPORTANT]
> **Prototype Status: Simulation Mode**
>
> GridWise AI is currently a working prototype using virtual sensors. No physical hardware or real smart meter is connected yet. Energy readings, electrical parameters, and device loads are simulated by the backend. Real hardware integration is planned.

---

## Table of Contents

- [Overview](#overview)
- [Why GridWise AI](#why-gridwise-ai)
- [Project Philosophy](#project-philosophy)
- [Features and Implementation Status](#features-and-implementation-status)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [How It Works](#how-it-works)
- [Real Hardware Integration](#real-hardware-integration)
- [API Overview](#api-overview)
- [Demo Guide](#demo-guide)
- [Roadmap](#roadmap)
- [Screenshots](#screenshots)
- [Security and Limitations](#security-and-limitations)
- [Contributing](#contributing)
- [License](#license)
- [Author](#author)
- [Acknowledgements](#acknowledgements)

---

## Overview

Traditional electricity monitoring mainly focuses on total energy consumption and billing. GridWise AI aims to provide deeper insights into how and when electricity is consumed.

It combines energy monitoring, statistical analytics, anomaly detection, forecasting, cost intelligence, and automated alerts in a single platform.

The system helps users understand unusual consumption patterns, anticipate future electricity usage, estimate costs, and make more informed energy-management decisions.

### Key Capabilities

- Monitor electricity consumption through virtual sensors.
- Visualize voltage, current, power, frequency, and energy readings.
- Detect unusual electricity consumption patterns.
- Forecast the next 24 hours of energy demand.
- Estimate month-to-date and projected electricity costs.
- Generate evidence-based energy-saving recommendations.
- Simulate potential savings using configurable assumptions.
- Upload and analyze custom electricity consumption datasets.
- Send instant email alerts when unusual consumption is detected.
- Support future integration with ESP32-based hardware.

**Current development status:** Working prototype with simulated sensor data and a backend prepared for hardware ingestion.

---

## Why GridWise AI

1. **Understand, not just monitor:** Convert electricity readings into understandable insights, patterns, and explanations.
2. **Detect problems earlier:** Identify unusual consumption and notify responsible personnel through configurable alerts.
3. **Make informed decisions:** Combine forecasting, cost estimation, recommendations, and savings simulation to support better energy management.

---

## Project Philosophy

GridWise AI follows an eight-stage energy intelligence workflow:

| Stage | Purpose |
|---|---|
| Measure | Collect electricity consumption data. |
| Understand | Analyze usage patterns and energy behavior. |
| Detect | Identify unusual consumption. |
| Predict | Forecast future energy demand. |
| Explain | Present understandable insights and evidence. |
| Simulate | Estimate the impact of possible actions. |
| Optimize | Recommend opportunities to reduce consumption. |
| Verify | Compare expected and actual savings. |

The objective is to move beyond basic electricity monitoring toward informed energy management.

---

## Features and Implementation Status

The following table distinguishes working functionality from simulated components and future development.

### Implemented

| Feature | Description | Status |
|---|---|---|
| User Authentication | Sign up and sign in with bcrypt password hashing. | Implemented |
| Token Authentication | JWT authentication with 8-hour token validity. | Implemented |
| Rate-Limited Authentication | Rate limiting for authentication endpoints. | Implemented |
| Organization Isolation | Backend queries enforce per-organization data isolation. | Implemented |
| Audit Logging | Records relevant application activities. | Implemented |
| Two-Step Registration | Two-step sign-up with a password strength meter. | Implemented |
| Overview Dashboard | KPIs, energy health score, time-of-day usage, peak hours, and forecast preview. | Implemented |
| Live Energy | Displays current energy readings and virtual load information. | Implemented |
| Analytics | Visual analysis of electricity consumption. | Implemented |
| Anomaly Detection | Detects unusual consumption using a robust statistical method. | Implemented |
| Forecasting | Predicts electricity demand for the next 24 hours. | Implemented |
| Cost Intelligence | Configurable flat electricity tariff in INR. | Implemented |
| Recommendations | Generates rule-based recommendations with supporting evidence and assumptions. | Implemented |
| Savings Simulator | Estimates potential savings and displays the calculation formula. | Implemented |
| Dataset Upload | Uploads and analyzes custom CSV datasets. | Implemented |
| Devices | Device management interface and device-key generation. | Implemented |
| Instant Alerts | In-app notifications, email notifications, acknowledgement, and resolution. | Implemented |
| Automatic Escalation | Escalates unacknowledged alerts to the head after a configured time. | Implemented |
| Email Notifications | Professional HTML email notifications with personalized subjects through SMTP. | Implemented |
| Reports | CSV export of reading data. | Implemented |
| Settings | Tariff configuration and light/dark theme settings. | Implemented |
| Public Website | Landing page with an interactive browser-generated demo. | Implemented |
| Security and Transparency | Public-facing explanation of the prototype's security approach and limitations. | Implemented |

### Simulated

| Feature | Description | Status |
|---|---|---|
| Virtual Sensors | Backend generates new readings every 5 seconds. | Simulated |
| Virtual Electrical Parameters | Power, voltage, current, frequency, power factor, and temperature readings. | Simulated |
| Virtual Loads | Switchable LED bulbs, fan, small motor, and heater. | Simulated |
| Live Energy Data | Readings are recorded while a signed-in user has the application open. | Simulated |
| Interactive Website Demo | Uses browser-generated demonstration data. | Simulated |
| Device Ingestion | The `POST /ingest` endpoint is available, but no physical device is connected. | Simulated |

### Planned

| Feature | Description | Status |
|---|---|---|
| Hindi Interface | Hindi language support. | Planned |
| Marathi Interface | Marathi language support. | Planned |
| Time-of-Day Tariff Screen | Maharashtra smart-meter-style ToD cost interface. A backend endpoint already exists. | Planned |
| ESP32 Firmware | Firmware for real-time hardware data transmission. | Planned |
| AI Assistant | LLM-based assistant to explain analytics and results. | Planned |
| Password Reset | Account password recovery. | Planned |
| Profile Editing | User profile management. | Planned |
| PDF Reports | Downloadable PDF reports. | Planned |
| Multi-Site Comparison | Compare consumption across multiple sites. | Planned |
| Savings Verification | Verify estimated savings against actual consumption. | Planned |
| SMS Alerts | Alert notifications through SMS. | Planned |

---

## Technology Stack

GridWise AI uses a modern frontend and Python-based backend architecture.

### Frontend

| Technology | Purpose |
|---|---|
| React | User interface development |
| Vite | Frontend development and build tooling |
| React Router | Client-side navigation |
| Recharts | Charts and data visualization |
| Lucide React | Interface icons |
| Plain CSS | Styling and design tokens |
| CSS Themes | Light and dark themes |

### Backend

| Technology | Purpose |
|---|---|
| Python | Backend programming language |
| FastAPI | REST API development |
| Pydantic | Data validation |
| SQLAlchemy | Database ORM |
| PyJWT | Token-based authentication |
| bcrypt | Password hashing |
| pandas | Dataset processing and analytics |
| NumPy | Numerical and statistical calculations |

### Database

| Database | Usage |
|---|---|
| SQLite | Default database with zero setup |
| PostgreSQL | Optional database for extended deployment requirements |

### Testing

- pytest

---

## Architecture

GridWise AI follows a frontend-backend architecture.

```text
                  GRIDWISE AI
                       |
          +------------+------------+
          |                         |
     React Frontend             FastAPI Backend
          |                         |
     React Router              Authentication
     Recharts                  Analytics Engine
     Lucide React              Anomaly Detection
     CSS Themes                Forecasting Engine
          |                    Cost Intelligence
          |                    Recommendations
          |                    Alert Management
          |                         |
          |                    SQLAlchemy ORM
          |                         |
          |                  +------+------+
          |                  |             |
          |                SQLite       PostgreSQL
          |                  |
          |             Energy Readings
          |             User Accounts
          |             Organizations
          |             Alerts
          |             Devices
          |             Datasets
          |
       REST API
          |
    Live Dashboard
    Analytics
    Reports