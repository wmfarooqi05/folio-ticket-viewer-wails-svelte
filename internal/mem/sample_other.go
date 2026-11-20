//go:build !windows

package mem

import "errors"

// Sampler is Windows-only (Folio is a Windows app); other systems build and report nothing.
type Sampler struct{}

// NewSampler returns a Sampler.
func NewSampler() *Sampler { return &Sampler{} }

// Sample reports that nothing can be measured.
func (*Sampler) Sample() (uint64, error) { return 0, errors.ErrUnsupported }

// SampleTree is Sample for any root PID.
func SampleTree(uint32) (uint64, error) { return 0, errors.ErrUnsupported }
