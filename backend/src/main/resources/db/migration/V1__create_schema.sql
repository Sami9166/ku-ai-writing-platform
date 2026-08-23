CREATE TABLE courses (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(32) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
);

CREATE TABLE assignments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    course_id BIGINT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    due_at TIMESTAMP(6) NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_assignments_course FOREIGN KEY (course_id) REFERENCES courses(id)
);

CREATE TABLE students (
    id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    major VARCHAR(120) NULL,
    grade TINYINT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT chk_students_grade CHECK (grade IS NULL OR grade BETWEEN 1 AND 6)
);

CREATE TABLE enrollments (
    course_id BIGINT NOT NULL,
    student_id VARCHAR(20) NOT NULL,
    enrolled_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (course_id, student_id),
    CONSTRAINT fk_enrollments_course FOREIGN KEY (course_id) REFERENCES courses(id),
    CONSTRAINT fk_enrollments_student FOREIGN KEY (student_id) REFERENCES students(id)
);

CREATE TABLE ai_interactions (
    id VARCHAR(64) PRIMARY KEY,
    assignment_id BIGINT NOT NULL,
    student_id VARCHAR(20) NOT NULL,
    role VARCHAR(16) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT chk_interactions_role CHECK (role IN ('user', 'ai')),
    CONSTRAINT fk_interactions_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(id),
    CONSTRAINT fk_interactions_student FOREIGN KEY (student_id) REFERENCES students(id)
);

CREATE INDEX idx_interactions_student_time
    ON ai_interactions (assignment_id, student_id, created_at);

CREATE TABLE ai_events (
    id VARCHAR(64) PRIMARY KEY,
    assignment_id BIGINT NOT NULL,
    student_id VARCHAR(20) NOT NULL,
    type VARCHAR(32) NOT NULL,
    response_id VARCHAR(64) NULL,
    highlighted_text TEXT NULL,
    verdict VARCHAR(32) NULL,
    reason TEXT NULL,
    method VARCHAR(100) NULL,
    parent_event_id VARCHAR(64) NULL,
    executed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_events_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(id),
    CONSTRAINT fk_events_student FOREIGN KEY (student_id) REFERENCES students(id),
    CONSTRAINT fk_events_parent FOREIGN KEY (parent_event_id) REFERENCES ai_events(id)
);

CREATE INDEX idx_events_student_time
    ON ai_events (assignment_id, student_id, created_at);
CREATE INDEX idx_events_response
    ON ai_events (assignment_id, student_id, response_id);

CREATE TABLE submissions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    assignment_id BIGINT NOT NULL,
    student_id VARCHAR(20) NOT NULL,
    status VARCHAR(16) NOT NULL,
    content LONGTEXT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT chk_submissions_status CHECK (status IN ('draft', 'submitted')),
    CONSTRAINT fk_submissions_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(id),
    CONSTRAINT fk_submissions_student FOREIGN KEY (student_id) REFERENCES students(id)
);

CREATE INDEX idx_submissions_latest
    ON submissions (assignment_id, student_id, id);

CREATE TABLE rubric_evaluations (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    assignment_id BIGINT NOT NULL,
    student_id VARCHAR(20) NOT NULL,
    mode VARCHAR(16) NOT NULL,
    result_json JSON NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_evaluations_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(id),
    CONSTRAINT fk_evaluations_student FOREIGN KEY (student_id) REFERENCES students(id)
);

CREATE INDEX idx_evaluations_latest
    ON rubric_evaluations (assignment_id, student_id, id);

CREATE TABLE professor_scores (
    assignment_id BIGINT NOT NULL,
    student_id VARCHAR(20) NOT NULL,
    initiative TINYINT NULL,
    prompt TINYINT NULL,
    critical TINYINT NULL,
    creative TINYINT NULL,
    transparent TINYINT NULL,
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (assignment_id, student_id),
    CONSTRAINT chk_score_initiative CHECK (initiative IS NULL OR initiative BETWEEN 1 AND 5),
    CONSTRAINT chk_score_prompt CHECK (prompt IS NULL OR prompt BETWEEN 1 AND 5),
    CONSTRAINT chk_score_critical CHECK (critical IS NULL OR critical BETWEEN 1 AND 5),
    CONSTRAINT chk_score_creative CHECK (creative IS NULL OR creative BETWEEN 1 AND 5),
    CONSTRAINT chk_score_transparent CHECK (transparent IS NULL OR transparent BETWEEN 1 AND 5),
    CONSTRAINT fk_scores_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(id),
    CONSTRAINT fk_scores_student FOREIGN KEY (student_id) REFERENCES students(id)
);

CREATE TABLE review_resolutions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    assignment_id BIGINT NOT NULL,
    student_id VARCHAR(20) NOT NULL,
    review_id VARCHAR(96) NOT NULL,
    status VARCHAR(24) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT chk_review_status CHECK (status IN ('fulfilled', 'not_fulfilled')),
    CONSTRAINT fk_reviews_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(id),
    CONSTRAINT fk_reviews_student FOREIGN KEY (student_id) REFERENCES students(id)
);

CREATE INDEX idx_reviews_latest
    ON review_resolutions (assignment_id, student_id, review_id, id);
