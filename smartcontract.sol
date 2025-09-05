// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ChecklistTracker {
    // Enum-like: 0 = Pending (default), 1 = Submitted, 2 = Approved
    mapping(address => mapping(uint8 => uint8)) public stepStatus;

    // Tracks the number of completed (approved) steps for each wallet
    mapping(address => uint8) public completedSteps;

    // Tracks the current step (last approved step + 1) for each wallet
    mapping(address => uint8) public currentStep;

    address public immutable owner;

    constructor() {
        owner = msg.sender;
    }

    // Submission functions (callable by any wallet for themselves)
    function submitStep1() public {
        require(stepStatus[msg.sender][1] == 0, "Step 1 already submitted or approved.");
        stepStatus[msg.sender][1] = 1; // Submitted
        currentStep[msg.sender] = 1; // Current step is 1 (Pending -> Submitted)
    }

    function submitStep2() public {
        require(stepStatus[msg.sender][2] == 0, "Step 2 already submitted or approved.");
        require(stepStatus[msg.sender][1] == 2, "Step 1 not approved.");
        stepStatus[msg.sender][2] = 1; // Submitted
        currentStep[msg.sender] = 2; // Current step is 2
    }

    function submitStep3() public {
        require(stepStatus[msg.sender][3] == 0, "Step 3 already submitted or approved.");
        require(stepStatus[msg.sender][2] == 2, "Step 2 not approved.");
        stepStatus[msg.sender][3] = 1; // Submitted
        currentStep[msg.sender] = 3; // Current step is 3
    }

    function submitStep4() public {
        require(stepStatus[msg.sender][4] == 0, "Step 4 already submitted or approved.");
        require(stepStatus[msg.sender][3] == 2, "Step 3 not approved.");
        stepStatus[msg.sender][4] = 1; // Submitted
        currentStep[msg.sender] = 4; // Current step is 4
    }

    function submitStep5() public {
        require(stepStatus[msg.sender][5] == 0, "Step 5 already submitted or approved.");
        require(stepStatus[msg.sender][4] == 2, "Step 4 not approved.");
        stepStatus[msg.sender][5] = 1; // Submitted
        currentStep[msg.sender] = 5; // Current step is 5
    }

    function submitStep6() public {
        require(stepStatus[msg.sender][6] == 0, "Step 6 already submitted or approved.");
        require(stepStatus[msg.sender][5] == 2, "Step 5 not approved.");
        stepStatus[msg.sender][6] = 1; // Submitted
        currentStep[msg.sender] = 6; // Current step is 6
    }

    function submitStep7() public {
        require(stepStatus[msg.sender][7] == 0, "Step 7 already submitted or approved.");
        require(stepStatus[msg.sender][6] == 2, "Step 6 not approved.");
        stepStatus[msg.sender][7] = 1; // Submitted
        currentStep[msg.sender] = 7; // Current step is 7
    }

    function submitStep8() public {
        require(stepStatus[msg.sender][8] == 0, "Step 8 already submitted or approved.");
        require(stepStatus[msg.sender][7] == 2, "Step 7 not approved.");
        stepStatus[msg.sender][8] = 1; // Submitted
        currentStep[msg.sender] = 8; // Current step is 8
    }

    function submitStep9() public {
        require(stepStatus[msg.sender][9] == 0, "Step 9 already submitted or approved.");
        require(stepStatus[msg.sender][8] == 2, "Step 8 not approved.");
        stepStatus[msg.sender][9] = 1; // Submitted
        currentStep[msg.sender] = 9; // Current step is 9
    }

    function submitStep10() public {
        require(stepStatus[msg.sender][10] == 0, "Step 10 already submitted or approved.");
        require(stepStatus[msg.sender][9] == 2, "Step 9 not approved.");
        stepStatus[msg.sender][10] = 1; // Submitted
        currentStep[msg.sender] = 10; // Current step is 10
    }

    // Approval functions (only callable by owner)
    function approveStep1(address wallet) public {
        require(msg.sender == owner, "Only owner can approve.");
        require(stepStatus[wallet][1] == 1, "Step 1 not submitted.");
        require(completedSteps[wallet] == 0, "Previous steps not completed in order.");
        stepStatus[wallet][1] = 2; // Approved
        completedSteps[wallet] = 1;
        currentStep[wallet] = 2; // Move to next step
    }

    function approveStep2(address wallet) public {
        require(msg.sender == owner, "Only owner can approve.");
        require(stepStatus[wallet][2] == 1, "Step 2 not submitted.");
        require(completedSteps[wallet] == 1, "Previous steps not completed in order.");
        stepStatus[wallet][2] = 2; // Approved
        completedSteps[wallet] = 2;
        currentStep[wallet] = 3; // Move to next step
    }

    function approveStep3(address wallet) public {
        require(msg.sender == owner, "Only owner can approve.");
        require(stepStatus[wallet][3] == 1, "Step 3 not submitted.");
        require(completedSteps[wallet] == 2, "Previous steps not completed in order.");
        stepStatus[wallet][3] = 2; // Approved
        completedSteps[wallet] = 3;
        currentStep[wallet] = 4; // Move to next step
    }

    function approveStep4(address wallet) public {
        require(msg.sender == owner, "Only owner can approve.");
        require(stepStatus[wallet][4] == 1, "Step 4 not submitted.");
        require(completedSteps[wallet] == 3, "Previous steps not completed in order.");
        stepStatus[wallet][4] = 2; // Approved
        completedSteps[wallet] = 4;
        currentStep[wallet] = 5; // Move to next step
    }

    function approveStep5(address wallet) public {
        require(msg.sender == owner, "Only owner can approve.");
        require(stepStatus[wallet][5] == 1, "Step 5 not submitted.");
        require(completedSteps[wallet] == 4, "Previous steps not completed in order.");
        stepStatus[wallet][5] = 2; // Approved
        completedSteps[wallet] = 5;
        currentStep[wallet] = 6; // Move to next step
    }

    function approveStep6(address wallet) public {
        require(msg.sender == owner, "Only owner can approve.");
        require(stepStatus[wallet][6] == 1, "Step 6 not submitted.");
        require(completedSteps[wallet] == 5, "Previous steps not completed in order.");
        stepStatus[wallet][6] = 2; // Approved
        completedSteps[wallet] = 6;
        currentStep[wallet] = 7; // Move to next step
    }

    function approveStep7(address wallet) public {
        require(msg.sender == owner, "Only owner can approve.");
        require(stepStatus[wallet][7] == 1, "Step 7 not submitted.");
        require(completedSteps[wallet] == 6, "Previous steps not completed in order.");
        stepStatus[wallet][7] = 2; // Approved
        completedSteps[wallet] = 7;
        currentStep[wallet] = 8; // Move to next step
    }

    function approveStep8(address wallet) public {
        require(msg.sender == owner, "Only owner can approve.");
        require(stepStatus[wallet][8] == 1, "Step 8 not submitted.");
        require(completedSteps[wallet] == 7, "Previous steps not completed in order.");
        stepStatus[wallet][8] = 2; // Approved
        completedSteps[wallet] = 8;
        currentStep[wallet] = 9; // Move to next step
    }

    function approveStep9(address wallet) public {
        require(msg.sender == owner, "Only owner can approve.");
        require(stepStatus[wallet][9] == 1, "Step 9 not submitted.");
        require(completedSteps[wallet] == 8, "Previous steps not completed in order.");
        stepStatus[wallet][9] = 2; // Approved
        completedSteps[wallet] = 9;
        currentStep[wallet] = 10; // Move to next step
    }

    function approveStep10(address wallet) public {
        require(msg.sender == owner, "Only owner can approve.");
        require(stepStatus[wallet][10] == 1, "Step 10 not submitted.");
        require(completedSteps[wallet] == 9, "Previous steps not completed in order.");
        stepStatus[wallet][10] = 2; // Approved
        completedSteps[wallet] = 10;
        currentStep[wallet] = 11; // Process completed
    }

    // View function to get the status of a specific step for a wallet
    // Returns 0=Pending, 1=Submitted, 2=Approved
    function getStepStatus(address wallet, uint8 step) public view returns (uint8) {
        require(step >= 1 && step <= 10, "Invalid step number.");
        return stepStatus[wallet][step];
    }

    // View function to get the number of completed (approved) steps for a wallet
    function getCompletedSteps(address wallet) public view returns (uint8) {
        return completedSteps[wallet];
    }

    // View function to get the current step for a wallet (last approved step + 1)
    function getCurrentStep(address wallet) public view returns (uint8) {
        return currentStep[wallet];
    }
}