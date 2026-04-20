const StudentService = require('./StudentService');
const MultiTenantAuthService = require('./MultiTenantAuthService');
const GamificationService = require('./GamificationService');
const { v4: uuidv4 } = require('uuid');

/**
 * Viral Growth System
 * Manages invites, friends, challenges, and referral programs
 */
class ViralGrowthService {
  constructor() {
    this.inviteRewards = {
      inviter: {
        coins: 50,
        xp: 25,
        badge_threshold: 3 // After 3 successful invites
      },
      invited: {
        coins: 100,
        xp: 50,
        welcome_bonus: true
      }
    };
    
    this.friendFeatures = {
      max_friends: 50,
      safe_chat: false, // No direct chat for safety
      activities: ['challenges', 'leaderboards', 'comparisons'],
      age_matching: true,
      parent_approval: true
    };
    
    this.challengeTypes = {
      daily: {
        duration: 24 * 60 * 60 * 1000, // 24 hours
        participants: 'friends',
        rewards: { winner: 100, participant: 25 }
      },
      weekly: {
        duration: 7 * 24 * 60 * 60 * 1000, // 7 days
        participants: 'class',
        rewards: { winner: 500, participant: 100 }
      },
      special: {
        duration: 3 * 24 * 60 * 60 * 1000, // 3 days
        participants: 'school',
        rewards: { winner: 1000, participant: 200 }
      }
    };
  }

  async generateInviteCode(studentId, parentUserId) {
    try {
      const student = await StudentService.getStudent(studentId);
      
      const inviteCode = {
        code_id: uuidv4(),
        student_id: studentId,
        parent_id: parentUserId,
        code: this.generateUniqueCode(),
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
        usage_limit: 10,
        times_used: 0,
        status: 'active',
        rewards_earned: 0
      };

      return {
        invite_code: inviteCode.code,
        invite_url: `https://kidai.app/invite/${inviteCode.code}`,
        qr_code: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://kidai.app/invite/${inviteCode.code}`,
        sharing_options: this.getSharingOptions(inviteCode),
        expires_at: inviteCode.expires_at
      };
    } catch (error) {
      throw new Error(`Erreur génération code invitation: ${error.message}`);
    }
  }

  async processInviteResponse(inviteCode, newStudentData, parentConsent = false) {
    try {
      const invite = await this.getInviteByCode(inviteCode);
      
      if (!invite || invite.status !== 'active') {
        throw new Error('Code d\'invitation invalide ou expiré');
      }

      if (invite.times_used >= invite.usage_limit) {
        throw new Error('Code d\'invitation déjà utilisé trop de fois');
      }

      if (!parentConsent) {
        throw new Error('Consentement parent requis');
      }

      // Create new student account
      const newStudent = await StudentService.createStudent(newStudentData);
      
      // Process invite rewards
      await this.processInviteRewards(invite, newStudent);
      
      // Update invite usage
      invite.times_used += 1;
      invite.updated_at = new Date().toISOString();
      
      // Create friendship suggestion
      await this.createFriendshipSuggestion(invite.student_id, newStudent.student_id);

      return {
        invite_processed: true,
        new_student_id: newStudent.student_id,
        rewards: {
          inviter_rewards: this.inviteRewards.inviter,
          invited_rewards: this.inviteRewards.invited
        },
        friendship_suggestion: {
          suggested_friend_id: invite.student_id,
          auto_approve: true
        }
      };
    } catch (error) {
      throw new Error(`Erreur traitement invitation: ${error.message}`);
    }
  }

  async sendFriendRequest(studentId, targetStudentId, message = '') {
    try {
      const student = await StudentService.getStudent(studentId);
      const targetStudent = await StudentService.getStudent(targetStudentId);
      
      // Check age compatibility
      if (!this.isAgeCompatible(student.age, targetStudent.age)) {
        throw new Error('Incompatibilité d\'âge pour les amis');
      }

      // Check if already friends
      const existingFriendship = await this.getFriendship(studentId, targetStudentId);
      if (existingFriendship) {
        throw new Error('Déjà amis ou demande en cours');
      }

      // Check friend limit
      const friendCount = await this.getFriendCount(studentId);
      if (friendCount >= this.friendFeatures.max_friends) {
        throw new Error('Limite d\'amis atteinte');
      }

      const friendRequest = {
        request_id: uuidv4(),
        from_student_id: studentId,
        to_student_id: targetStudentId,
        message: message || '',
        status: 'pending',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      };

      // This would save to database and notify the target student's parent
      return {
        request_sent: true,
        request_id: friendRequest.request_id,
        expires_at: friendRequest.expires_at,
        next_steps: ['En attente d\'approbation parentale', 'La famille de l\'ami sera notifiée']
      };
    } catch (error) {
      throw new Error(`Erreur demande d'ami: ${error.message}`);
    }
  }

  async respondToFriendRequest(requestId, response, parentUserId) {
    try {
      const request = await this.getFriendRequest(requestId);
      
      if (request.status !== 'pending') {
        throw new Error('Demande d\'ami déjà traitée');
      }

      // Verify parent authorization
      const authorized = await this.verifyParentAuthorization(parentUserId, request.to_student_id);
      if (!authorized) {
        throw new Error('Non autorisé à répondre à cette demande');
      }

      if (response === 'accept') {
        // Create friendship
        const friendship = {
          friendship_id: uuidv4(),
          student1_id: request.from_student_id,
          student2_id: request.to_student_id,
          created_at: new Date().toISOString(),
          status: 'active',
          activities_shared: [],
          challenges_competed: []
        };

        // Update request status
        request.status = 'accepted';
        request.responded_at = new Date().toISOString();
        request.responded_by = parentUserId;

        // Award friendship bonus
        await this.awardFriendshipBonus(request.from_student_id, request.to_student_id);

        return {
          friendship_created: true,
          friendship_id: friendship.friendship_id,
          new_friend: await this.getStudentBasicInfo(request.from_student_id),
          bonus_earned: {
            coins: 25,
            xp: 15
          }
        };
      } else {
        // Reject request
        request.status = 'rejected';
        request.responded_at = new Date().toISOString();
        request.responded_by = parentUserId;

        return {
          request_rejected: true,
          message: 'Demande d\'ami refusée'
        };
      }
    } catch (error) {
      throw new Error(`Erreur réponse demande d'ami: ${error.message}`);
    }
  }

  async createChallenge(challengeData) {
    try {
      const challenge = {
        challenge_id: uuidv4(),
        title: challengeData.title,
        description: challengeData.description,
        type: challengeData.type || 'daily',
        skill_focus: challengeData.skill_focus || 'mixed',
        difficulty: challengeData.difficulty || 'medium',
        requirements: {
          exercises: challengeData.exercises || 10,
          accuracy_min: challengeData.accuracy_min || 0.8,
          time_limit: challengeData.time_limit || 1800, // 30 minutes
          start_date: challengeData.start_date || new Date().toISOString()
        },
        participants: {
          creator_id: challengeData.creator_id,
            max_participants: challengeData.max_participants || 10,
            current_participants: [challengeData.creator_id],
            participant_type: challengeData.participant_type || 'friends'
        },
        rewards: this.challengeTypes[challengeData.type || 'daily'].rewards,
        duration: this.challengeTypes[challengeData.type || 'daily'].duration,
        status: 'active',
        created_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + (this.challengeTypes[challengeData.type || 'daily'].duration)).toISOString()
      };

      // This would save to database and notify potential participants
      return {
        challenge_created: true,
        challenge_id: challenge.challenge_id,
        invite_friends: true,
        share_options: this.getChallengeSharingOptions(challenge)
      };
    } catch (error) {
      throw new Error(`Erreur création défi: ${error.message}`);
    }
  }

  async joinChallenge(challengeId, studentId, parentConsent = false) {
    try {
      const challenge = await this.getChallenge(challengeId);
      const student = await StudentService.getStudent(studentId);
      
      if (!parentConsent && this.friendFeatures.parent_approval) {
        throw new Error('Consentement parent requis');
      }

      if (challenge.status !== 'active') {
        throw new Error('Défi non actif');
      }

      if (new Date() > new Date(challenge.ends_at)) {
        throw new Error('Défi expiré');
      }

      if (challenge.participants.current_participants.includes(studentId)) {
        throw new Error('Déjà participant à ce défi');
      }

      if (challenge.participants.current_participants.length >= challenge.participants.max_participants) {
        throw new Error('Défi complet');
      }

      // Add participant
      challenge.participants.current_participants.push(studentId);
      challenge.updated_at = new Date().toISOString();

      // Create challenge progress tracker
      const progress = {
        progress_id: uuidv4(),
        challenge_id: challengeId,
        student_id: studentId,
        started_at: new Date().toISOString(),
        exercises_completed: 0,
        correct_answers: 0,
        total_time: 0,
        accuracy: 0,
        status: 'in_progress'
      };

      return {
        joined_successfully: true,
        challenge_info: {
          title: challenge.title,
          ends_at: challenge.ends_at,
          requirements: challenge.requirements,
          rewards: challenge.rewards
        },
        progress_tracker: progress.progress_id
      };
    } catch (error) {
      throw new Error(`Error joining challenge: ${error.message}`);
    }
  }

  async getLeaderboard(studentId, type = 'friends', period = 'week') {
    try {
      const student = await StudentService.getStudent(studentId);
      
      let participants = [];
      
      switch (type) {
        case 'friends':
          participants = await this.getFriendLeaderboardParticipants(studentId);
          break;
        case 'class':
          participants = await this.getClassLeaderboardParticipants(student.class_id);
          break;
        case 'school':
          participants = await this.getSchoolLeaderboardParticipants(student.tenant_id);
          break;
        case 'global':
          participants = await this.getGlobalLeaderboardParticipants();
          break;
        default:
          participants = await this.getFriendLeaderboardParticipants(studentId);
      }

      const leaderboard = this.calculateLeaderboardRankings(participants, period);
      
      return {
        type,
        period,
        student_rank: this.findStudentRank(leaderboard, studentId),
        top_performers: leaderboard.slice(0, 10),
        total_participants: participants.length,
        student_position: this.getStudentPosition(leaderboard, studentId)
      };
    } catch (error) {
      throw new Error(`Erreur classement: ${error.message}`);
    }
  }

  async getViralGrowthStats(tenantId) {
    try {
      return {
        invitation_metrics: await this.getInvitationMetrics(tenantId),
        friendship_metrics: await this.getFriendshipMetrics(tenantId),
        challenge_metrics: await this.getChallengeMetrics(tenantId),
        engagement_metrics: await this.getEngagementMetrics(tenantId),
        conversion_rates: await this.getConversionRates(tenantId),
        viral_coefficient: await this.calculateViralCoefficient(tenantId)
      };
    } catch (error) {
      throw new Error(`Erreur statistiques croissance virale: ${error.message}`);
    }
  }

  // Helper methods
  generateUniqueCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  getSharingOptions(invite) {
    return {
      whatsapp: `https://wa.me/?text=Rejoins-moi sur KidAI! Mon code d'invitation: ${invite.code}`,
      email: `mailto:?subject=Invitation KidAI&body=Rejoins-moi sur KidAI! Mon code d'invitation: ${invite.code}`,
      sms: `sms:?body=Rejoins-moi sur KidAI! Mon code d'invitation: ${invite.code}`,
      social: {
        facebook: `https://www.facebook.com/sharer/sharer.php?u=https://kidai.app/invite/${invite.code}`,
        twitter: `https://twitter.com/intent/tweet?text=Rejoins-moi sur KidAI!&url=https://kidai.app/invite/${invite.code}`
      }
    };
  }

  isAgeCompatible(age1, age2) {
    const maxAgeDiff = 2; // Maximum 2 years difference
    return Math.abs(age1 - age2) <= maxAgeDiff;
  }

  async processInviteRewards(invite, newStudent) {
    // Award rewards to inviter
    const inviterStudent = await StudentService.getStudent(invite.student_id);
    inviterStudent.addCoins(this.inviteRewards.inviter.coins);
    inviterStudent.addXP(this.inviteRewards.inviter.xp);
    
    // Check for invite badge
    if (invite.times_used + 1 >= this.inviteRewards.inviter.badge_threshold) {
      inviterStudent.addBadge({
        id: 'social_butterfly',
        name: 'Papillon Social',
        description: 'Invité 3 amis avec succès',
        icon: 'butterfly',
        xp_reward: 50,
        coin_reward: 25
      });
    }
    
    // Award welcome bonus to new student
    newStudent.addCoins(this.inviteRewards.invited.coins);
    newStudent.addXP(this.inviteRewards.invited.xp);
    
    if (this.inviteRewards.invited.welcome_bonus) {
      newStudent.addBadge({
        id: 'friend_joined',
        name: 'Nouvel Ami',
        description: 'Rejoint KidAI via une invitation',
        icon: 'friends',
        xp_reward: 25,
        coin_reward: 15
      });
    }
  }

  async createFriendshipSuggestion(student1Id, student2Id) {
    const suggestion = {
      suggestion_id: uuidv4(),
      student1_id: student1Id,
      student2_id: student2Id,
      reason: 'invite_connection',
      auto_approve: true,
      created_at: new Date().toISOString()
    };
    
    return suggestion;
  }

  async awardFriendshipBonus(student1Id, student2Id) {
    const student1 = await StudentService.getStudent(student1Id);
    const student2 = await StudentService.getStudent(student2Id);
    
    student1.addCoins(25);
    student1.addXP(15);
    student2.addCoins(25);
    student2.addXP(15);
  }

  getChallengeSharingOptions(challenge) {
    return {
      friends: `Rejoins mon défi "${challenge.title}"!`,
      class: `Défi de classe: ${challenge.title}`,
      social: `Partage ce défi et gagne des récompenses!`
    };
  }

  calculateLeaderboardRankings(participants, period) {
    // This would calculate rankings based on performance in the given period
    return participants
      .map(participant => ({
        student_id: participant.student_id,
        name: `${participant.first_name} ${participant.last_name}`,
        score: this.calculateParticipantScore(participant, period),
        avatar: participant.avatar,
        level: participant.level
      }))
      .sort((a, b) => b.score - a.score);
  }

  calculateParticipantScore(participant, period) {
    // Calculate score based on XP, accuracy, consistency, etc.
    return participant.xp + (participant.accuracy * 100) + (participant.streak * 10);
  }

  findStudentRank(leaderboard, studentId) {
    const index = leaderboard.findIndex(p => p.student_id === studentId);
    return index >= 0 ? index + 1 : null;
  }

  getStudentPosition(leaderboard, studentId) {
    const rank = this.findStudentRank(leaderboard, studentId);
    if (!rank) return null;
    
    const percentile = (rank / leaderboard.length) * 100;
    return {
      rank,
      percentile,
      category: this.getPerformanceCategory(percentile)
    };
  }

  getPerformanceCategory(percentile) {
    if (percentile <= 10) return 'top_10';
    if (percentile <= 25) return 'top_quarter';
    if (percentile <= 50) return 'above_average';
    if (percentile <= 75) return 'below_average';
    return 'bottom_quarter';
  }

  // Placeholder implementations for database operations
  async getInviteByCode(code) {
    // This would fetch from database
    throw new Error('Invite storage not implemented');
  }

  async getFriendship(student1Id, student2Id) {
    // This would check for existing friendship
    return null;
  }

  async getFriendCount(studentId) {
    // This would count friends
    return 0;
  }

  async getFriendRequest(requestId) {
    // This would fetch from database
    throw new Error('Friend request storage not implemented');
  }

  async verifyParentAuthorization(parentUserId, studentId) {
    // This would verify parent authorization
    return true;
  }

  async getStudentBasicInfo(studentId) {
    const student = await StudentService.getStudent(studentId);
    return {
      student_id: student.student_id,
      name: `${student.first_name} ${student.last_name}`,
      avatar: student.avatar,
      level: student.level
    };
  }

  async getChallenge(challengeId) {
    // This would fetch from database
    throw new Error('Challenge storage not implemented');
  }

  async getFriendLeaderboardParticipants(studentId) {
    // This would get friends for leaderboard
    return [];
  }

  async getClassLeaderboardParticipants(classId) {
    // This would get class members for leaderboard
    return [];
  }

  async getSchoolLeaderboardParticipants(tenantId) {
    // This would get school members for leaderboard
    return [];
  }

  async getGlobalLeaderboardParticipants() {
    // This would get global participants
    return [];
  }

  // Placeholder implementations for stats methods
  async getInvitationMetrics(tenantId) {
    return {
      total_invites: 0,
      successful_invites: 0,
      conversion_rate: 0,
      avg_invites_per_user: 0
    };
  }

  async getFriendshipMetrics(tenantId) {
    return {
      total_friendships: 0,
      avg_friends_per_user: 0,
      friendship_success_rate: 0
    };
  }

  async getChallengeMetrics(tenantId) {
    return {
      total_challenges: 0,
      participation_rate: 0,
      completion_rate: 0
    };
  }

  async getEngagementMetrics(tenantId) {
    return {
      daily_active_users: 0,
      viral_actions_per_user: 0,
      social_engagement_rate: 0
    };
  }

  async getConversionRates(tenantId) {
    return {
      invite_to_signup: 0.15,
      signup_to_active: 0.8,
      active_to_paying: 0.1
    };
  }

  async calculateViralCoefficient(tenantId) {
    return 1.2; // Average viral coefficient
  }
}

module.exports = new ViralGrowthService();
