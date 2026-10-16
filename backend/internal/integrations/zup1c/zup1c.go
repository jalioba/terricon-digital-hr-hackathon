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
	// GetEmployee returns official (read-only) HR data of the employee.
	GetEmployee(email string) (EmployeeRecord, error)
	// PostVacation books a vacation order ("Проведена в 1С:ЗУП").
	PostVacation(email string, days int) (docNumber string, err error)
	PostAdvance(email string, amount float64) (docNumber string, err error)
}

type Mock struct{}

func NewMock() *Mock { return &Mock{} }

func (Mock) GetEmployee(email string) (EmployeeRecord, error) {
	// Predefined 1C:ZUP mock records for demo employees
	records := map[string]EmployeeRecord{
		"employee.supply@janamen.kz":     {Position: "Специалист по поставкам", VacationDaysLeft: 24},
		"employee.supply2@janamen.kz":    {Position: "Менеджер заказов", VacationDaysLeft: 14},
		"employee.logistics@janamen.kz":  {Position: "Кладовщик-оператор", VacationDaysLeft: 10},
		"employee.logistics2@janamen.kz": {Position: "Логист", VacationDaysLeft: 24},
		"employee.it@janamen.kz":         {Position: "Специалист техподдержки", VacationDaysLeft: 22},
		"employee.it2@janamen.kz":        {Position: "Оператор поддержки клиентов", VacationDaysLeft: 24},
		"manager.supply@janamen.kz":      {Position: "Руководитель отдела поставок", VacationDaysLeft: 18},
		"manager.logistics@janamen.kz":   {Position: "Руководитель логистики и склада", VacationDaysLeft: 12},
		"manager.it@janamen.kz":          {Position: "Руководитель IT и поддержки", VacationDaysLeft: 20},
		"hr@janamen.kz":                  {Position: "HR-директор", VacationDaysLeft: 24},
	}
	if r, ok := records[email]; ok {
		return r, nil
	}
	return EmployeeRecord{Position: "Сотрудник JanaPost", VacationDaysLeft: 24}, nil
}

func (Mock) PostVacation(email string, days int) (string, error) {
	return fmt.Sprintf("ZUP-VAC-%d", 1000+days), nil
}

func (Mock) PostAdvance(email string, amount float64) (string, error) {
	return fmt.Sprintf("ZUP-ADV-%d", int(amount)%10000), nil
}
