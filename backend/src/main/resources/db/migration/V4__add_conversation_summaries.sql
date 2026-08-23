CREATE TABLE conversation_summaries (
    assignment_id BIGINT NOT NULL,
    student_id VARCHAR(20) NOT NULL,
    summary TEXT NOT NULL,
    summarized_interaction_count INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (assignment_id, student_id),
    CONSTRAINT fk_conversation_summaries_assignment
        FOREIGN KEY (assignment_id) REFERENCES assignments (id),
    CONSTRAINT fk_conversation_summaries_student
        FOREIGN KEY (student_id) REFERENCES students (id),
    CONSTRAINT chk_conversation_summaries_count
        CHECK (summarized_interaction_count >= 0)
);
