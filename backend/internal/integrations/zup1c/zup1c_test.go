package zup1c

import "testing"

func TestMock1CIntegration(t *testing.T) {
	mock := NewMock()

	rec, err := mock.GetEmployee("010203500123")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rec.VacationDaysLeft != 24 {
		t.Fatalf("unexpected record: %+v", rec)
	}

	doc, err := mock.PostVacation("010203500123", 9)
	if err != nil || doc == "" {
		t.Fatalf("expected valid order number, got %s, err: %v", doc, err)
	}
}
