CREATE TABLE rubric_source_versions (
    assignment_id BIGINT NOT NULL,
    student_id VARCHAR(20) NOT NULL,
    source_version INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (assignment_id, student_id),
    CONSTRAINT fk_rubric_source_versions_assignment
        FOREIGN KEY (assignment_id) REFERENCES assignments (id),
    CONSTRAINT fk_rubric_source_versions_student
        FOREIGN KEY (student_id) REFERENCES students (id),
    CONSTRAINT chk_rubric_source_versions_value
        CHECK (source_version >= 0)
);
