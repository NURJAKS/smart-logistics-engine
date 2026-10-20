import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "FastAPI is running!"}

def test_simulate_issue_validation_too_few_locations():
    # Needs at least 2 locations
    payload = {
        "locations": [[37.0150, 39.7505]],
        "num_vehicles": 1,
        "problem_index": 0
    }
    response = client.post("/simulate-issue", json=payload)
    assert response.status_code == 400
    assert "Нужно минимум 2 точки" in response.json()["detail"]

def test_simulate_issue_validation_out_of_bounds_index():
    payload = {
        "locations": [
            [37.0150, 39.7505],
            [37.0250, 39.7540]
        ],
        "num_vehicles": 1,
        "problem_index": 5
    }
    response = client.post("/simulate-issue", json=payload)
    assert response.status_code == 400
    assert "problem_index вне диапазона" in response.json()["detail"]

def test_invalid_payload_format():
    response = client.post("/simulate-issue", json={"invalid": "payload"})
    assert response.status_code == 422
