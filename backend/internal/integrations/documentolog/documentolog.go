// Package documentolog is the Documentolog adapter. This is a MOCK implementation.
// To integrate the real system, implement Client with its REST API (create document
// + route for approval + poll status) and swap it in main.go.
package documentolog

import "fmt"

type Client interface {
	SubmitForApproval(requestID int, kind string) (docID string, err error)
	GetStatus(docID string) (string, error)
}

type Mock struct{}

func NewMock() *Mock { return &Mock{} }

func (Mock) SubmitForApproval(requestID int, kind string) (string, error) {
	return fmt.Sprintf("DOC-%s-%05d", kind, requestID), nil
}

func (Mock) GetStatus(docID string) (string, error) { return "approved", nil }
