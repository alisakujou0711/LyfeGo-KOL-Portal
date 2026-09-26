def test_health_answers_from_the_test_database(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "lyfego_test"}
