import os
from datetime import datetime, timedelta, timezone
from sqlalchemy import create_engine, ForeignKey, String, Float, DateTime, Index, Text, Boolean
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

URL = os.getenv("DATABASE_URL") or "sqlite:///./gridwise.db"
engine = create_engine(URL, connect_args={"check_same_thread": False} if URL.startswith("sqlite") else {})
Session = sessionmaker(engine, autoflush=False)
TZ = int(os.getenv("TZ_OFFSET_MIN", "330"))

def now():
    """Site-local naive time. All stored timestamps use this convention."""
    return datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=TZ)

class Base(DeclarativeBase): pass

class Org(Base):
    __tablename__ = "orgs"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    tariff: Mapped[float] = mapped_column(Float, default=8.0)  # INR per kWh, flat

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(20), default="owner")
    org_id: Mapped[int] = mapped_column(ForeignKey("orgs.id"), index=True)

class Site(Base):
    __tablename__ = "sites"
    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("orgs.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))

class Device(Base):
    __tablename__ = "devices"
    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    source_type: Mapped[str] = mapped_column(String(20), default="simulated")  # simulated | hardware
    key_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

class Reading(Base):
    __tablename__ = "readings"
    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"))
    ts: Mapped[datetime] = mapped_column(DateTime)
    voltage_v: Mapped[float] = mapped_column(Float)
    current_a: Mapped[float] = mapped_column(Float)
    power_w: Mapped[float] = mapped_column(Float)
    energy_kwh: Mapped[float] = mapped_column(Float)  # energy used in the interval this reading covers
    frequency_hz: Mapped[float] = mapped_column(Float, default=50.0)
    power_factor: Mapped[float | None] = mapped_column(Float, nullable=True)
    temperature_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    source_type: Mapped[str] = mapped_column(String(20), default="simulated")
    __table_args__ = (Index("ix_reading_dev_ts", "device_id", "ts"),)

class Audit(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int | None] = mapped_column(index=True, nullable=True)
    user_id: Mapped[int | None] = mapped_column(nullable=True)
    action: Mapped[str] = mapped_column(String(200))
    ts: Mapped[datetime] = mapped_column(DateTime, default=now)

# ---- Added: customer datasets and the alert system ----
class Dataset(Base):
    __tablename__ = "datasets"
    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("orgs.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    unit: Mapped[str] = mapped_column(String(8))
    rows_used: Mapped[int] = mapped_column(default=0)
    rows_dropped: Mapped[int] = mapped_column(default=0)
    data: Mapped[str] = mapped_column(Text)  # JSON list of [hour_iso, kwh, kw]

class AlertSetting(Base):
    __tablename__ = "alert_settings"
    org_id: Mapped[int] = mapped_column(primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    escalation_min: Mapped[int] = mapped_column(default=5)

class AlertContact(Base):
    __tablename__ = "alert_contacts"
    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("orgs.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="head")  # head | manager | staff
    min_severity: Mapped[str] = mapped_column(String(10), default="medium")
    active: Mapped[bool] = mapped_column(Boolean, default=True)

class Alert(Base):
    __tablename__ = "alerts"
    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("orgs.id"), index=True)
    ts: Mapped[datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    severity: Mapped[str] = mapped_column(String(10))
    observed_kw: Mapped[float] = mapped_column(Float)
    expected_kw: Mapped[float] = mapped_column(Float)
    message: Mapped[str] = mapped_column(String(400))
    status: Mapped[str] = mapped_column(String(14), default="new")  # new | acknowledged | resolved
    source: Mapped[str] = mapped_column(String(10), default="live")  # live | test
    escalated: Mapped[bool] = mapped_column(Boolean, default=False)
    log: Mapped[str] = mapped_column(Text, default="")
