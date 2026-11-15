import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { SceneInterpretation } from '../../components/SceneInterpretation';

describe('SceneInterpretation Component', () => {
  it('renders default placeholder text when description is empty', () => {
    render(<SceneInterpretation description="" timestamp="00:00" />);
    expect(screen.getByText(/Monitoring video stream/i)).toBeInTheDocument();
  });

  it('renders active scene description and timestamp', () => {
    render(
      <SceneInterpretation
        description="A delivery van stops at the red light while pedestrians cross."
        timestamp="01:45"
      />
    );
    expect(
      screen.getByText('A delivery van stops at the red light while pedestrians cross.')
    ).toBeInTheDocument();
    expect(screen.getByText('01:45')).toBeInTheDocument();
  });

  it('renders tokens and latency badges when provided', () => {
    render(
      <SceneInterpretation
        description="Traffic flow slows down."
        timestamp="02:10"
        tokens={245}
        latency_s={1.24}
      />
    );
    expect(screen.getByText('245 tok')).toBeInTheDocument();
    expect(screen.getByText('1.24s')).toBeInTheDocument();
  });

  it('contains proper IDs ciBody and ciTimestamp', () => {
    render(<SceneInterpretation description="Test body" timestamp="03:00" />);
    expect(document.getElementById('ciBody')).toBeInTheDocument();
    expect(document.getElementById('ciTimestamp')).toBeInTheDocument();
  });
});
