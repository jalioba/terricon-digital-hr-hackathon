// Package zup1c is the 1C:ZUP adapter. This is a MOCK implementation.
// To integrate the real 1C:ZUP, implement the Client interface using its HTTP/OData
// service (e.g. /odata/standard.odata/Catalog_Сотрудники) and swap it in main.go.
package zup1c

import "fmt"

type EmployeeRecord struct {
	Position         string
	VacationDaysLeft int
}

type Client interface {
	// GetEmployee returns official (read-only) HR data of the employee by IIN.
	GetEmployee(iin string) (EmployeeRecord, error)
	// PostVacation books a vacation order ("Проведена в 1С:ЗУП").
	PostVacation(iin string, days int) (docNumber string, err error)
	PostAdvance(iin string, amount float64) (docNumber string, err error)
}

type Mock struct{}

func NewMock() *Mock { return &Mock{} }

func (Mock) GetEmployee(iin string) (EmployeeRecord, error) {
	// Standard response from 1C:ZUP
	return EmployeeRecord{Position: "Сотрудник JanaPost", VacationDaysLeft: 24}, nil
}

func (Mock) PostVacation(iin string, days int) (string, error) {
	return fmt.Sprintf("1C-ZUP-VAC-%d", 1000+days), nil
}

func (Mock) PostAdvance(iin string, amount float64) (string, error) {
	return fmt.Sprintf("1C-ZUP-ADV-%d", int(amount)%10000), nil
}
