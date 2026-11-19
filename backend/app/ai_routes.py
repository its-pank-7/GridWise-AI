
import logging
import os

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .ai_agent import GridWiseAgent
from .models import Org
from .analytics import detect_anomalies, forecast, recommendations

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["GridWise AI Agent"])

_agent = None


def get_agent():
    global _agent

    if _agent is None:
        try:
            _agent = GridWiseAgent()
        except Exception:
            logger.exception("GridWise AI initialization failed")
            raise HTTPException(
                status_code=503,
                detail="AI service is not configured. Check backend/.env."
            )

    return _agent


class ChatMessage(BaseModel):
    message: str = Field(min_length=1, max_length=3000)
    history: list[dict] = Field(default_factory=list, max_length=8)


def build_energy_context(user, db):
    # Import helpers here to avoid circular imports.
    from .main import hourly_df, summary, org_devices

    dashboard = summary(user, db)
    hourly = hourly_df(db, user)

    anomalies = detect_anomalies(hourly)
    forecast_data = forecast(hourly)

    organization = db.get(Org, user.org_id)

    if organization is None:
        raise HTTPException(
            status_code=404,
            detail="Organization not found"
        )

    recs = recommendations(
        hourly,
        organization.tariff,
        anomalies
    )

    devices = org_devices(db, user)

    return {
        "dashboard": dashboard,
        "forecast": forecast_data,
        "anomalies": anomalies[:10],
        "recommendations": recs,
        "devices": [
            {
                "name": device.name,
                "source": device.source_type
            }
            for device in devices
        ],
        "data_mode": (
            "simulated"
            if devices and all(
                d.source_type == "simulated" for d in devices
            )
            else "mixed or hardware"
        ),
        "data_note": (
            "Use actual stored readings and distinguish measured "
            "values from forecasts and estimates."
        )
    }


@router.post("/chat")
def chat(
    body: ChatMessage,
    user=Depends(__import__("app.main", fromlist=["current_user"]).current_user),
    db=Depends(__import__("app.main", fromlist=["get_db"]).get_db)
):
    try:
        context = build_energy_context(user, db)

        agent = get_agent()
        answer = agent.ask(
            message=body.message,
            context=context,
            history=body.history
        )

        return {
            "success": True,
            "answer": answer,
            "model": agent.model
        }

    except HTTPException:
        raise

    except Exception:
        logger.exception("GridWise AI chat request failed")
        raise HTTPException(
            status_code=503,
            detail="GridWise AI could not process your request. Please try again."
        )


@router.get("/status")
def ai_status(
    user=Depends(__import__("app.main", fromlist=["current_user"]).current_user)
):
    return {
        "available": bool(os.getenv("GROQ_API_KEY")),
        "assistant": "GridWise AI Agent"
    }
